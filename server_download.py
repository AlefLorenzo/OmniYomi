#!/usr/bin/env python3
"""
Servidor HTTP simples para download do APK OmniYomi
Acesse via: http://SEU_IP_LOCAL:8080
"""
import http.server
import socketserver
import json
import os
import subprocess
import threading
import webbrowser
from pathlib import Path

PORT = 8080
DIRECTORY = Path(__file__).parent

# HTML template as a separate string to avoid f-string issues
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>OmniYomi - Download APK</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f1117 0%, #1a1d2e 100%);
            color: #e8e8e8;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 2rem 1rem;
        }}
        .container {{
            max-width: 480px;
            width: 100%;
            background: rgba(26, 29, 46, 0.95);
            border-radius: 20px;
            padding: 2.5rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.1);
        }}
        .logo {{
            width: 80px;
            height: 80px;
            border-radius: 18px;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem;
            box-shadow: 0 8px 30px rgba(99, 102, 241, 0.4);
        }}
        .logo svg {{ width: 44px; height: 44px; color: white; }}
        h1 {{ font-size: 1.75rem; font-weight: 700; text-align: center; margin-bottom: 0.5rem; }}
        .subtitle {{ text-align: center; color: #9ca3af; margin-bottom: 2rem; font-size: 0.95rem; }}
        .version-badge {{
            display: inline-block;
            background: rgba(99, 102, 241, 0.2);
            color: #a5b4fc;
            padding: 0.35rem 0.85rem;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
        }}
        .btn {{
            width: 100%;
            padding: 1rem 1.5rem;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            text-decoration: none;
        }}
        .btn-primary {{
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
        }}
        .btn-primary:hover {{ transform: translateY(-2px); box-shadow: 0 8px 30px rgba(99, 102, 241, 0.5); }}
        .btn-primary:active {{ transform: translateY(0); }}
        .btn-primary:disabled {{ opacity: 0.6; cursor: not-allowed; transform: none; }}
        .btn-secondary {{
            background: rgba(255,255,255,0.1);
            color: #e8e8e8;
            border: 1px solid rgba(255,255,255,0.2);
            margin-top: 0.75rem;
        }}
        .btn-secondary:hover {{ background: rgba(255,255,255,0.15); }}
        .spinner {{
            width: 20px; height: 20px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            display: none;
        }}
        .btn.loading .spinner {{ display: block; }}
        .btn.loading .btn-text {{ display: none; }}
        @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
        .features {{
            margin-top: 2rem;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
        }}
        .feature {{
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 1rem;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.05);
        }}
        .feature-icon {{ font-size: 1.5rem; margin-bottom: 0.5rem; }}
        .feature-title {{ font-size: 0.8rem; font-weight: 600; color: #a5b4fc; margin-bottom: 0.25rem; }}
        .feature-desc {{ font-size: 0.7rem; color: #9ca3af; }}
        .status {{
            margin-top: 1.5rem;
            padding: 1rem;
            border-radius: 10px;
            font-size: 0.85rem;
            text-align: center;
            display: none;
        }}
        .status.success {{ background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); display: block; }}
        .status.error {{ background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); display: block; }}
        .status.info {{ background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); display: block; }}
        .qr-code {{
            margin-top: 1.5rem;
            text-align: center;
            display: none;
        }}
        .qr-code img {{
            width: 180px; height: 180px;
            background: white;
            border-radius: 12px;
            padding: 10px;
        }}
        .github-link {{
            display: inline-block;
            margin-top: 1.5rem;
            color: #a5b4fc;
            text-decoration: none;
            font-size: 0.85rem;
        }}
        .github-link:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
        </div>
        <h1>OmniYomi</h1>
        <p class="subtitle">Leitor de Mangás, Manhwas e Manhuas</p>
        <span class="version-badge">v1.1.8</span>

        <a id="downloadBtn" class="btn btn-primary" href="#" onclick="return false;">
            <span class="btn-text">📥 Baixar APK (GitHub Releases)</span>
            <span class="spinner"></span>
        </a>

        <button id="buildBtn" class="btn btn-secondary" onclick="triggerBuild()">
            🔨 Compilar nova versão (GitHub Actions)
        </button>

        <div id="status" class="status"></div>

        <div class="features">
            <div class="feature">
                <div class="feature-icon">📱</div>
                <div class="feature-title">100% Offline</div>
                <div class="feature-desc">Funciona sem servidor</div>
            </div>
            <div class="feature">
                <div class="feature-icon">🔌</div>
                <div class="feature-title">Extensões Nativas</div>
                <div class="feature-desc">Tachiyomi/Mihon ABI</div>
            </div>
            <div class="feature">
                <div class="feature-icon">📥</div>
                <div class="feature-title">Downloads Offline</div>
                <div class="feature-desc">Capítulos no dispositivo</div>
            </div>
            <div class="feature">
                <div class="feature-icon">🔄</div>
                <div class="feature-title">Auto-Update</div>
                <div class="feature-desc">Via GitHub Releases</div>
            </div>
        </div>

        <div class="qr-code" id="qrCode"></div>

        <a class="github-link" href="https://github.com/AlefLorenzo/OmniYomi/releases" target="_blank">
            📦 Ver todas as releases no GitHub →
        </a>
    </div>

    <script>
        const downloadBtn = document.getElementById('downloadBtn');
        const buildBtn = document.getElementById('buildBtn');
        const statusDiv = document.getElementById('status');
        const qrCodeDiv = document.getElementById('qrCode');

        // Detectar URL base para QR code
        const baseUrl = window.location.origin;

        function showStatus(message, type = 'info') {
            statusDiv.textContent = message;
            statusDiv.className = 'status ' + type;
        }

        function hideStatus() {
            statusDiv.className = 'status';
        }

        // Redirecionar para GitHub Releases
        downloadBtn.addEventListener('click', () => {
            window.open('https://github.com/AlefLorenzo/OmniYomi/releases/latest', '_blank');
            showStatus('Abrindo GitHub Releases...', 'success');
            setTimeout(hideStatus, 3000);
        });

        // Disparar build no GitHub Actions
        async function triggerBuild() {
            buildBtn.disabled = true;
            buildBtn.classList.add('loading');
            buildBtn.querySelector('.btn-text').textContent = '⏳ Disparando build...';
            showStatus('Disparando workflow no GitHub Actions...', 'info');

            try {
                const response = await fetch('/api/trigger-build', { method: 'POST' });
                const data = await response.json();
                if (data.success) {
                    showStatus('✅ Build disparado! Verifique a aba Actions no GitHub.', 'success');
                } else {
                    showStatus('⚠️ ' + (data.error || 'Erro ao disparar build'), 'error');
                }
            } catch (e) {
                showStatus('❌ Erro de conexão: ' + e.message, 'error');
            } finally {
                buildBtn.disabled = false;
                buildBtn.classList.remove('loading');
                buildBtn.querySelector('.btn-text').textContent = '🔨 Compilar nova versão (GitHub Actions)';
            }
        }

        // Gerar QR Code para compartilhar
        function generateQRCode() {
            const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(baseUrl);
            qrCodeDiv.innerHTML = '<p style="margin-bottom: 0.5rem; font-size: 0.8rem; color: #9ca3af;">Escaneie para acessar no celular:</p><img src="' + qrUrl + '" alt="QR Code">';
            qrCodeDiv.style.display = 'block';
        }

        // Verificar releases do GitHub
        async function checkReleases() {
            try {
                const response = await fetch('/api/github-releases');
                const data = await response.json();
                if (data.length > 0) {
                    const latest = data[0];
                    const apkAsset = latest.assets.find(a => a.name.endsWith('.apk'));
                    if (apkAsset) {
                        downloadBtn.href = apkAsset.browser_download_url;
                        downloadBtn.querySelector('.btn-text').textContent = '📥 Baixar ' + apkAsset.name;
                        showStatus('✅ Release encontrada: ' + latest.tag_name, 'success');
                        setTimeout(hideStatus, 5000);
                    }
                }
            } catch (e) {
                console.log('GitHub API:', e);
            }
        }

        // Inicializar
        checkReleases();
        generateQRCode();

        // Atualizar a cada 30s
        setInterval(checkReleases, 30000);
    </script>
</body>
</html>"""

class OmniYomiHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(HTML_TEMPLATE.encode('utf-8'))
        elif self.path == '/api/github-releases':
            self.proxy_github_releases()
        elif self.path == '/api/trigger-build':
            self.trigger_github_workflow()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/trigger-build':
            self.trigger_github_workflow()
        else:
            self.send_response(404)
            self.end_headers()

    def proxy_github_releases(self):
        """Proxy para GitHub Releases API"""
        import urllib.request
        try:
            url = 'https://api.github.com/repos/AlefLorenzo/OmniYomi/releases'
            req = urllib.request.Request(url, headers={'User-Agent': 'OmniYomi-Download-Server'})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def trigger_github_workflow(self):
        """Disparar workflow via GitHub API (precisa de token)"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        # Sem token configurado, retorna instruções
        self.wfile.write(json.dumps({
            'success': False,
            'error': 'Configure GITHUB_TOKEN nas variáveis de ambiente do servidor para disparar builds automaticamente.',
            'manual': 'Acesse: https://github.com/AlefLorenzo/OmniYomi/actions/workflows/android-build.yml'
        }).encode())

    def log_message(self, format, *args):
        print("[{}] {}".format(self.address_string(), format % args))

def get_local_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    local_ip = get_local_ip()

    print("""
╔══════════════════════════════════════════════════════════════╗
║  📱 OmniYomi Download Server                                 ║
╠══════════════════════════════════════════════════════════════╣
║  Acesse no celular: http://{}:{}                    ║
║  Acesse local:      http://localhost:{}                    ║
╠══════════════════════════════════════════════════════════════╣
║  O APK será baixado do GitHub Releases (latest)              ║
║  Para compilar nova versão, clique no botão "Compilar"       ║
╚══════════════════════════════════════════════════════════════╝
""".format(local_ip, PORT, PORT))

    with socketserver.TCPServer(("", PORT), OmniYomiHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Servidor encerrado")