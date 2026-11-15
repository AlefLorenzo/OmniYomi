#!/bin/bash
# ============================================================
# OMNIYOMI - DEPLOY 100% AUTOMATIZADO NO ORACLE CLOUD FREE
# ============================================================
# Recursos GRATUITOS usados:
#   - Oracle Cloud: 4 vCPU ARM, 24GB RAM, 200GB Block Volume
#   - Let's Encrypt: SSL gratuito
#   - GitHub: Código e CI/CD gratuito
#   - Docker Hub: Imagens gratuitas
#   - Discord/Telegram: Alertas gratuitos
# ============================================================

set -euo pipefail

# ===== CORES =====
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log() { echo -e "${GREEN}[OMNIYOMI]${NC} $*"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $*"; }
error() { echo -e "${RED}[ERRO]${NC} $*"; exit 1; }

# ===== DEFAULTS =====
DOMAIN=""
EMAIL=""
DISCORD_WEBHOOK=""
TELEGRAM_BOT=""
TELEGRAM_CHAT=""
REPO_URL="https://github.com/AlefLorenzo/OmniYomi.git"
INSTALL_DIR="/opt/omniyomi"
SWAP_SIZE="4G"
BLOCK_VOLUME_SIZE="50G"

# ===== PARSE ARGUMENTS =====
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain) DOMAIN="$2"; shift 2 ;;
        --email) EMAIL="$2"; shift 2 ;;
        --discord-webhook) DISCORD_WEBHOOK="$2"; shift 2 ;;
        --telegram-bot) TELEGRAM_BOT="$2"; shift 2 ;;
        --telegram-chat) TELEGRAM_CHAT="$2"; shift 2 ;;
        --repo) REPO_URL="$2"; shift 2 ;;
        --dir) INSTALL_DIR="$2"; shift 2 ;;
        --swap) SWAP_SIZE="$2"; shift 2 ;;
        -h|--help)
            echo "Uso: $0 [opções]"
            echo "  --domain SEU_DOMINIO.COM        (obrigatório para SSL)"
            echo "  --email SEU@EMAIL.COM           (obrigatório para Let's Encrypt)"
            echo "  --discord-webhook URL           (opcional: alertas Discord)"
            echo "  --telegram-bot TOKEN            (opcional: alertas Telegram)"
            echo "  --telegram-chat CHAT_ID         (opcional: alertas Telegram)"
            echo "  --repo URL                      (padrão: GitHub oficial)"
            echo "  --dir DIRETORIO                 (padrão: /opt/omniyomi)"
            echo "  --swap TAMANHO                  (padrão: 4G)"
            exit 0
            ;;
        *) error "Opção desconhecida: $1" ;;
    esac
done

# ===== VALIDAÇÕES =====
[[ $EUID -eq 0 ]] || error "Execute como root: sudo bash $0 ..."
[[ -n "$DOMAIN" ]] || error "Domínio obrigatório: --domain seusite.com"
[[ -n "$EMAIL" ]] || error "Email obrigatório: --email seu@email.com"
command -v git >/dev/null || error "Git não instalado: apt install git"
command -v curl >/dev/null || error "Curl não instalado: apt install curl"

log "=========================================="
log "🚀 OMNIYOMI - DEPLOY AUTOMÁTICO ORACLE FREE"
log "=========================================="
log "Domínio: $DOMAIN"
log "Email: $EMAIL"
log "Diretório: $INSTALL_DIR"
log "Swap: $SWAP_SIZE"
[[ -n "$DISCORD_WEBHOOK" ]] && log "Discord: Configurado"
[[ -n "$TELEGRAM_BOT" ]] && log "Telegram: Configurado"
log "=========================================="

# ===== FUNÇÕES AUXILIARES =====
retry() {
    local max=3 delay=5 attempt=1
    until "$@"; do
        if [[ $attempt -ge $max ]]; then return 1; fi
        warn "Tentativa $attempt falhou. Tentando novamente em ${delay}s..."
        sleep $delay
        ((attempt++))
    done
}

wait_for_health() {
    local url="$1" timeout="${2:-120}" interval=5 elapsed=0
    log "Aguardando $url ficar saudável..."
    while [[ $elapsed -lt $timeout ]]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            log "✅ Saudável!"
            return 0
        fi
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    error "Timeout aguardando health check"
}

# ============================================================
# 1. ATUALIZAÇÃO E PACOTES BASE
# ============================================================
log "📦 Atualizando sistema e instalando dependências..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" 2>/dev/null

apt-get install -y -qq \
    docker.io docker-compose-plugin docker-buildx \
    nginx certbot python3-certbot-nginx \
    htop iotop iftop ncdu jq tree \
    fail2ban ufw unattended-upgrades \
    awscli curl wget git rsync \
    prometheus-node-exporter \
    vim nano tmux 2>/dev/null

# ============================================================
# 2. DOCKER CONFIG
# ============================================================
log "🐳 Configurando Docker..."
systemctl enable --now docker
usermod -aG docker ubuntu

cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {"max-size": "50m", "max-file": "5"},
  "storage-driver": "overlay2",
  "default-ulimits": {"nofile": {"Hard": 64000, "Soft": 64000}},
  "experimental": true,
  "features": {"buildkit": true}
}
EOF
systemctl restart docker

# Buildx multi-arch
docker buildx create --name multiarch --driver docker-container --use 2>/dev/null || true
docker buildx inspect --bootstrap >/dev/null 2>&1

# ============================================================
# 3. FIREWALL (UFW) + ORACLE VCN AVISO
# ============================================================
log "🔥 Configurando Firewall..."
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 4567/tcp comment 'OmniYomi'
ufw --force enable >/dev/null

warn "⚠️  IMPORTANTE: Configure no Console Oracle Cloud:"
warn "   VCN > Security Lists > Ingress Rules:"
warn "   TCP 22, 80, 443, 4567 | Source: 0.0.0.0/0"

# ============================================================
# 4. FAIL2BAN
# ============================================================
log "🛡️ Configurando Fail2Ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
maxretry = 3
bantime = 3600

[nginx-http-auth]
enabled = true
maxretry = 3

[nginx-limit-req]
enabled = true
maxretry = 5
EOF
systemctl enable --now fail2ban

# ============================================================
# 5. DIRETÓRIOS E PERMISSÕES
# ============================================================
log "📁 Criando estrutura..."
mkdir -p "$INSTALL_DIR"/{data,logs,uploads,backups,ssl}
mkdir -p /var/www/certbot
chown -R 1000:1000 "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"

# ============================================================
# 6. SWAP (ESSENCIAL)
# ============================================================
if ! swapon --show | grep -q "/swapfile"; then
    log "💾 Criando swap $SWAP_SIZE..."
    fallocate -l "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' >> /etc/sysctl.d/99-swap.conf
fi

# ============================================================
# 6. OTIMIZAÇÕES KERNEL
# ============================================================
log "⚙️ Otimizando kernel..."
cat > /etc/sysctl.d/99-omniyomi.conf << 'EOF'
vm.max_map_count = 262144
fs.file-max = 1000000
fs.inotify.max_user_watches = 524288
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_tw_reuse = 1
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF
sysctl --system >/dev/null

# ============================================================
# 7. UNINSTALLED UPDATES
# ============================================================
log "🔄 Atualizações automáticas de segurança..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {"${distro_id}:${distro_codename}-security";"${distro_id}:${distro_codename}-updates";};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
echo 'APT::Periodic::Update-Package-Lists "1"; APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades

# ============================================================
# 7. CLONAR REPOSITÓRIO
# ============================================================
log "📥 Clonando repositório..."
cd "$INSTALL_DIR"
if [[ -d .git ]]; then
    log "Repositório já existe, atualizando..."
    git fetch --all
    git reset --hard origin/main
else
    git clone "$REPO_URL" .
fi

# ============================================================
# 8. CONFIGURAR .env
# ============================================================
log "⚙️ Configurando variáveis de ambiente..."
if [[ ! -f .env ]]; then
    cp .env.example .env
fi

# Gerar secrets seguros
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')

# Atualizar .env
cat > .env << EOF
# OmniYomi Server - Auto-generated $(date)
NODE_ENV=production
PORT=4567
SUWAYOMI_ENABLED=false
LOG_LEVEL=info
TZ=America/Sao_Paulo

JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET

DOMAIN=$DOMAIN
EMAIL_LETSENCRYPT=$EMAIL

GRAFANA_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')

# Backup S3 (opcional - configure se quiser)
# BACKUP_S3_BUCKET=
# BACKUP_S3_ENDPOINT=
# BACKUP_S3_ACCESS_KEY=
# BACKUP_S3_SECRET_KEY=

# Alertas (opcional)
$( [[ -n "$DISCORD_WEBHOOK" ]] && echo "DISCORD_WEBHOOK_URL=$DISCORD_WEBHOOK" )
$( [[ -n "$TELEGRAM_BOT" ]] && echo "TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT" )
$( [[ -n "$TELEGRAM_CHAT" ]] && echo "TELEGRAM_CHAT_ID=$TELEGRAM_CHAT" )
EOF

log "✅ .env configurado com secrets seguros"

# ============================================================
# 9. DOCKER COMPOSE PRODUÇÃO
# ============================================================
log "📝 Criando docker-compose.yml..."
cat > docker-compose.yml << 'COMPOSE_EOF'
version: '3.8'

services:
  omniyomi:
    image: omniyomi-server:latest
    build:
      context: .
      dockerfile: Dockerfile
      platforms: ["linux/arm64", "linux/amd64"]
    container_name: omniyomi-server
    restart: unless-stopped
    user: "1000:1000"
    environment:
      - NODE_ENV=production
      - PORT=4567
      - SUWAYOMI_ENABLED=false
      - LOG_LEVEL=info
      - TZ=America/Sao_Paulo
    volumes:
      - omniyomi-data:/app/data
      - omniyomi-logs:/app/logs
      - omniyomi-uploads:/app/uploads
    networks:
      - omniyomi-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4567/api/health"]
      interval: 30s
      timeout: 10s
      start_period: 20s
      retries: 3
    deploy:
      resources:
        limits: {memory: 2G, cpus: '3.5'}
        reservations: {memory: 512M, cpus: '1'}

  nginx:
    image: nginx:alpine
    container_name: omniyomi-nginx
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx-cache:/var/cache/nginx
    networks: [omniyomi-net]
    depends_on: [omniyomi]

  watchtower:
    image: containrrr/watchtower:latest
    container_name: omniyomi-watchtower
    restart: unless-stopped
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=3600
      - WATCHTOWER_LABEL_ENABLE=true
    volumes: [/var/run/docker.sock:/var/run/docker.sock]
    networks: [omniyomi-net]

  prometheus:
    image: prom/prometheus:latest
    container_name: omniyomi-prometheus
    restart: unless-stopped
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command: ['--config.file=/etc/prometheus/prometheus.yml','--storage.tsdb.path=/prometheus','--storage.tsdb.retention.time=30d']
    networks: [omniyomi-net]

  grafana:
    image: grafana/grafana:latest
    container_name: omniyomi-grafana
    restart: unless-stopped
    ports: ["3000:3000"]
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml:ro
    networks: [omniyomi-net]
    depends_on: [prometheus]

volumes:
  omniyomi-data: {driver: local, driver_opts: {type: none, o: bind, device: /opt/omniyomi/data}}
  omniyomi-logs: {driver: local, driver_opts: {type: none, o: bind, device: /opt/omniyomi/logs}}
  omniyomi-uploads: {driver: local, driver_opts: {type: none, o: bind, device: /opt/omniyomi/uploads}}
  prometheus-data: {}
  grafana-data: {}
  nginx-cache: {}

networks:
  omniyomi-net: {driver: bridge, ipam: {config: [{subnet: 172.28.0.0/16}]}}
COMPOSE_EOF

# ============================================================
# 10. NGINX CONF
# ============================================================
log "🌐 Configurando Nginx..."
cat > nginx.conf << 'NGINX_EOF'
user nginx; worker_processes auto; error_log /var/log/nginx/error.log warn; pid /var/run/nginx.pid;
events { worker_connections 1024; use epoll; multi_accept on; }
http {
    include /etc/nginx/mime.types; default_type application/octet-stream;
    log_format main '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" "$http_x_forwarded_for" rt=$request_time';
    access_log /var/log/nginx/access.log main; error_log /var/log/nginx/error.log warn;
    sendfile on; tcp_nopush on; tcp_nodelay on; keepalive_timeout 65; types_hash_max_size 2048; server_tokens off;
    gzip on; gzip_vary on; gzip_min_length 1024; gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s; limit_req_zone $binary_remote_addr zone=ws:10m rate=50r/s;
    upstream omniyomi_backend { server omniyomi:4567; keepalive 32; }
    server { listen 80; listen [::]:80; server_name _; location /.well-known/acme-challenge/ { root /var/www/certbot; } location / { return 301 https://$host$request_uri; } }
    server {
        listen 443 ssl http2; listen [::]:443 ssl http2; server_name _;
        ssl_certificate /etc/nginx/ssl/fullchain.pem; ssl_certificate_key /etc/nginx/ssl/privkey.pem; ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
        ssl_protocols TLSv1.2 TLSv1.3; ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384; ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m; ssl_session_timeout 10m;
        add_header X-Frame-Options "SAMEORIGIN" always; add_header X-Content-Type-Options "nosniff" always; add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        root /var/www/html; index index.html; client_max_body_size 100M;
        location /api/ { limit_req zone=api burst=200 nodelay; proxy_pass http://omniyomi_backend; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_cache off; proxy_read_timeout 120s; }
        location /ws { proxy_pass http://omniyomi_backend; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_buffering off; proxy_read_timeout 3600s; proxy_send_timeout 3600s; }
        location / { try_files $uri $uri/ /index.html; location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { expires 1y; add_header Cache-Control "public, immutable"; } }
        location /api/health { proxy_pass http://omniyomi_backend; access_log off; }
    }
}
NGINX_EOF

# ============================================================
# 10. PROMETHEUS + GRAFANA CONFIG
# ============================================================
cat > prometheus.yml << 'PROM_EOF'
global: {scrape_interval: 15s, evaluation_interval: 15s}
scrape_configs:
  - job_name: 'omniyomi'; static_configs: [{targets: ['omniyomi:4567']}]
  - job_name: 'nginx'; static_configs: [{targets: ['nginx:80']}]
  - job_name: 'node-exporter'; static_configs: [{targets: ['host.docker.internal:9100']}]
  - job_name: 'docker'; static_configs: [{targets: ['host.docker.internal:9323']}]
  - job_name: 'prometheus'; static_configs: [{targets: ['localhost:9090']}]
PROM_EOF

cat > grafana-datasources.yml << 'GRAFANA_EOF'
apiVersion: 1
datasources:
  - name: Prometheus; type: prometheus; url: http://prometheus:9090; access: proxy; isDefault: true; editable: false
GRAFANA_EOF

# ============================================================
# 11. DOCKERFILE MULTI-ARCH
# ============================================================
cat > Dockerfile << 'DOCKER_EOF'
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++ sqlite-dev
WORKDIR /app
COPY package*.json ./; COPY client/package*.json client/; COPY server/package*.json server/
RUN npm ci --workspaces --include-workspace-root
COPY . .
RUN npm run build:client && npm run build:server

FROM node:22-alpine AS runtime
RUN apk add --no-cache sqlite-libs tini curl ca-certificates && rm -rf /var/cache/apk/*
RUN addgroup -g 1000 -S omniyomi && adduser -u 1000 -S omniyomi -G omniyomi
WORKDIR /app
COPY --from=builder --chown=omniyomi:omniyomi /app/node_modules ./node_modules
COPY --from=builder --chown=omniyomi:omniyomi /app/client/dist ./client/dist
COPY --from=builder --chown=omniyomi:omniyomi /app/server/dist ./server/dist
COPY --from=builder --chown=omniyomi:omniyomi /app/package*.json ./
COPY --from=builder --chown=omniyomi:omniyomi /app/client/package*.json ./client/
COPY --from=builder --chown=omniyomi:omniyomi /app/server/package*.json ./server/
RUN mkdir -p /app/data /app/logs /app/uploads && chown -R omniyomi:omniyomi /app/data /app/logs /app/uploads
VOLUME ["/app/data", "/app/logs", "/app/uploads"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD curl -f http://localhost:4567/api/health || exit 1
ENTRYPOINT ["tini", "--"]; USER omniyomi; EXPOSE 4567; CMD ["node", "server/dist/index.js"]
DOCKER_EOF

# ============================================================
# 11. DEPLOY SCRIPT
# ============================================================
cat > deploy.sh << 'DEPLOY_EOF'
#!/bin/bash
set -euo pipefail
cd /opt/omniyomi
case "${1:-}" in
    start) docker compose up -d && sleep 10 && ./deploy.sh status ;;
    stop) docker compose down ;;
    restart) docker compose down && docker compose up -d ;;
    update) docker compose pull && docker compose up -d --build --force-recreate && docker image prune -f ;;
    logs) docker compose logs -f --tail=100 "${2:-}" ;;
    status) docker compose ps && echo && docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}" && echo && docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" ;;
    backup) docker compose stop omniyomi; tar -czf "backups/omniyomi_$(date +%Y%m%d_%H%M%S).tar.gz" -C /opt/omniyomi data logs uploads .env; docker compose start omniyomi ;;
    ssl) [[ -n "$DOMAIN" ]] || { echo "Configure DOMAIN no .env"; exit 1; }; mkdir -p ssl /var/www/certbot; docker run --rm -v "$(pwd)/ssl:/etc/letsencrypt" -v /var/www/certbot:/var/www/certbot certbot/certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --email "$EMAIL_LETSENCRYPT" --agree-tos --non-interactive; cp ssl/live/$DOMAIN/fullchain.pem ssl/fullchain.pem; cp ssl/live/$DOMAIN/privkey.pem ssl/privkey.pem; cp ssl/live/$DOMAIN/chain.pem ssl/chain.pem; docker compose restart nginx ;;
    *) echo "Uso: $0 {start|stop|restart|update|logs|status|backup|ssl}"; exit 1 ;;
esac
DEPLOY_EOF
chmod +x deploy.sh

# ============================================================
# 12. BACKUP + MONITOR SCRIPTS
# ============================================================
cat > backup.sh << 'BACKUP_EOF'
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/opt/omniyomi/backups"; mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
cd /opt/omniyomi
docker compose stop omniyomi
tar -czf "$BACKUP_DIR/omniyomi_$(date +%Y%m%d_%H%M%S).tar.gz" -C /opt/omniyomi data logs uploads .env 2>/dev/null
docker compose start omniyomi
find "$BACKUP_DIR" -name "omniyomi_*.tar.gz" -mtime +30 -delete
echo "Backup concluído: $(ls -lh "$BACKUP_DIR"/omniyomi_*.tar.gz | tail -1)"
BACKUP_EOF
chmod +x backup.sh

cat > monitor.sh << 'MONITOR_EOF'
#!/bin/bash
WEBHOOK="${DISCORD_WEBHOOK_URL:-}"; TG_BOT="${TELEGRAM_BOT_TOKEN:-}"; TG_CHAT="${TELEGRAM_CHAT_ID:-}"
alert() { [[ -n "$WEBHOOK" ]] && curl -s -X POST "$WEBHOOK" -H "Content-Type: application/json" -d "{\"embeds\":[{\"title\":\"$1\",\"description\":\"$2\",\"color\":15158332}]}" >/dev/null; [[ -n "$TG_BOT" ]] && curl -s "https://api.telegram.org/bot$TG_BOT/sendMessage" -d "chat_id=$TG_CHAT" -d "text=🚨 $1%0A$2" >/dev/null; }
cd /opt/omniyomi
curl -sf http://localhost:4567/api/health >/dev/null || { alert "OmniYomi DOWN" "API não responde"; docker compose restart omniyomi; }
DISK=$(df /opt/omniyomi | awk 'NR==2 {print $5}' | sed 's/%//'); [[ $DISK -gt 85 ]] && curl -s -X POST "$WEBHOOK" -d "{\"embeds\":[{\"title\":\"Disco Cheio\",\"description\":\"$DISK% usado\",\"color\":16776960}]}" >/dev/null
MEM=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}'); [[ $MEM -gt 90 ]] && curl -s -X POST "$WEBHOOK" -d "{\"embeds\":[{\"title\":\"Memória Alta\",\"description\":\"$MEM% usada\",\"color\":16776960}]}" >/dev/null
MONITOR_EOF
chmod +x monitor.sh

# ============================================================
# 13. CRONTABS
# ============================================================
log "⏰ Configurando agendamentos..."
cat > /etc/cron.d/omniyomi << 'CRON_EOF'
0 3 * * * root /opt/omniyomi/backup.sh >> /opt/omniyomi/logs/backup.log 2>&1
*/5 * * * * root /opt/omniyomi/monitor.sh >> /opt/omniyomi/logs/monitor.log 2>&1
30 2 * * * root certbot renew --quiet --deploy-hook "cd /opt/omniyomi && docker compose restart nginx" >> /opt/omniyomi/logs/ssl_renewal.log 2>&1
30 4 * * 1 root cd /opt/omniyomi && docker compose pull && docker compose up -d --build --force-recreate >> /opt/omniyomi/logs/auto_update.log 2>&1
0 4 * * 0 root docker system prune -f --volumes --filter "until=168h" >> /opt/omniyomi/logs/docker_cleanup.log 2>&1
CRON_EOF

# ============================================================
# 14. BUILD E START
# ============================================================
log "🔨 Building imagens (pode demorar 5-10 min)..."
retry docker compose build --parallel

log "🚀 Iniciando serviços..."
docker compose up -d

log "⏳ Aguardando serviços ficarem saudáveis..."
wait_for_health "http://localhost:4567/api/health" 180

# ============================================================
# 15. SSL (LET'S ENCRYPT)
# ============================================================
log "🔐 Configurando SSL Let's Encrypt..."
mkdir -p ssl /var/www/certbot
retry docker run --rm -v "$(pwd)/ssl:/etc/letsencrypt" -v /var/www/certbot:/var/www/certbot certbot/certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
cp ssl/live/$DOMAIN/fullchain.pem ssl/fullchain.pem
cp ssl/live/$DOMAIN/privkey.pem ssl/privkey.pem
cp ssl/live/$DOMAIN/chain.pem ssl/chain.pem
docker compose restart nginx
wait_for_health "https://$DOMAIN/api/health" 60

# ============================================================
# 16. TESTE FINAL
# ============================================================
log "🧪 Testando deploy..."
curl -sf "https://$DOMAIN/api/health" | jq . || curl -sf "http://localhost:4567/api/health" | jq .

# ============================================================
# 17. RESUMO FINAL
# ============================================================
log "=========================================="
log "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
log "=========================================="
log "🌐 URL: https://$DOMAIN"
log "📊 Grafana: http://$(curl -s ifconfig.me):3000 (admin / \$(grep GRAFANA_PASSWORD .env | cut -d= -f2))"
log "📁 Dados: $INSTALL_DIR/data"
log "📋 Logs: docker compose logs -f"
log "🔧 Gerenciar: ./deploy.sh {start|stop|restart|update|logs|status|backup|ssl}"
log "💾 Backup automático: 03:00 diário"
log "🔄 Auto-update: Segunda 04:30"
log "🔐 SSL renovação: Diário 02:30"
log "📊 Monitor: */5 min (Discord/Telegram alerts)"
log "=========================================="
log "✅ TUDO CONFIGURADO E FUNCIONANDO GRATUITAMENTE!"
log "=========================================="

# ============================================================
# SALVAR CREDENCIAIS
# ============================================================
cat > "$INSTALL_DIR/CREDENCIAIS.txt" << EOF
OMNIYOMI SERVER - CREDENCIAIS
=============================
URL: https://$DOMAIN
Grafana: http://$(curl -s ifconfig.me):3000
Usuário: admin
Senha: $(grep GRAFANA_PASSWORD .env | cut -d= -f2)

JWT_SECRET: $(grep JWT_SECRET .env | cut -d= -f2)
SESSION_SECRET: $(grep SESSION_SECRET .env | cut -d=2- -f=)

Backup: 03:00 diário (retém 30 dias)
SSL: Renovação automática Let's Encrypt
Updates: Watchtower (1h) + Rebuild semanal (seg 04:30)
Monitor: */5 min (Discord/Telegram alerts)

Comandos úteis:
  ./deploy.sh status    # Status completo
  ./deploy.sh logs      # Ver logs
  ./deploy.sh backup    # Backup manual
  ./deploy.sh update    # Atualizar
  ./deploy.sh restart   # Reiniciar
EOF

chmod 600 "$INSTALL_DIR/CREDENCIAIS.txt"

# ============================================================
# FINAL
# ============================================================
echo
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 OMNIYOMI DEPLOYADO COM SUCESSO NO ORACLE FREE!        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "🌐  Acesse: ${BLUE}https://$DOMAIN${NC}"
echo -e "📊 Grafana: ${BLUE}http://$(curl -s ifconfig.me):3000${NC} (admin / \$(grep GRAFANA_PASSWORD .env | cut -d= -f2))"
echo -e "📁 Credenciais salvas em: ${YELLOW}$INSTALL_DIR/CREDENCIAIS.txt${NC}"
echo
echo -e "${GREEN}💰 CUSTO TOTAL: $0.00 (100% GRATUITO NO ORACLE FREE TIER)${NC}"
echo
echo -e "${BLUE}Próximos passos:${NC}"
echo "1. Acesse https://$DOMAIN no navegador"
echo "2. Instale extensões (BR Mangás, Manga Livre, Asura Scans, etc.)"
echo "3. Baixe o APK no celular: https://github.com/AlefLorenzo/OmniYomi/releases/latest"
echo "4. Configure alertas Discord/Telegram se quiser"
echo
}