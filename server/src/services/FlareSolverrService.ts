import axios, { AxiosInstance } from 'axios';
import { db } from '../db/database.js';

export interface FlareSolverrResponse {
  status: 'ok' | 'error';
  message?: string;
  solution?: {
    url: string;
    status: number;
    headers: Record<string, string>;
    response: string;
    cookies: Array<{
      name: string;
      value: string;
      domain?: string;
      path?: string;
    }>;
    userAgent: string;
  };
  startTimestamp?: number;
  endTimestamp?: number;
  version?: string;
}

export interface SessionData {
  sessionId: string;
  userAgent?: string;
  cookies: Map<string, string>;
  createdAt: number;
}

export class FlareSolverrService {
  private static instance: FlareSolverrService;
  private client: AxiosInstance;
  private sessions: Map<string, SessionData> = new Map();
  private isAvailableCache: { available: boolean; lastChecked: number } = { available: false, lastChecked: 0 };

  constructor() {
    this.client = axios.create({
      timeout: 65000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  public static getInstance(): FlareSolverrService {
    if (!FlareSolverrService.instance) {
      FlareSolverrService.instance = new FlareSolverrService();
    }
    return FlareSolverrService.instance;
  }

  /**
   * Obtém a URL base configurada do FlareSolverr (padrão: http://localhost:8191/v1)
   */
  public getEndpointUrl(): string {
    const settings: any = db.getSettings();
    return settings?.flaresolverrUrl || 'http://localhost:8191/v1';
  }

  /**
   * Verifica se o FlareSolverr está rodando e acessível
   */
  public async checkHealth(): Promise<{ available: boolean; message: string; version?: string }> {
    const now = Date.now();
    // Cache de 30 segundos para evitar sobrecarga de healthcheck
    if (now - this.isAvailableCache.lastChecked < 30000 && this.isAvailableCache.lastChecked > 0) {
      return {
        available: this.isAvailableCache.available,
        message: this.isAvailableCache.available ? 'FlareSolverr operacional' : 'FlareSolverr inacessível',
      };
    }

    const endpoint = this.getEndpointUrl();
    try {
      const res = await axios.get(endpoint.replace(/\/v1\/?$/, '/'), { timeout: 3000 });
      const version = res.data?.version || 'v3.x';
      this.isAvailableCache = { available: true, lastChecked: now };
      return { available: true, message: `FlareSolverr conectado (${version})`, version };
    } catch {
      // Tentar endpoint /v1 caso a raiz retorne 404
      try {
        const postRes = await this.client.post(endpoint, { cmd: 'sessions.list' }, { timeout: 3000 });
        if (postRes.data?.status === 'ok') {
          this.isAvailableCache = { available: true, lastChecked: now };
          return { available: true, message: 'FlareSolverr conectado via v1 API' };
        }
      } catch (err: any) {
        // falhou
      }

      this.isAvailableCache = { available: false, lastChecked: now };
      return {
        available: false,
        message: `FlareSolverr não está em execução em ${endpoint}. Fontes protegidas por Cloudflare Turnstile utilizarão fallback inteligente ou retornarão aviso de limitação técnica.`,
      };
    }
  }

  /**
   * Resolve um desafio Cloudflare para a URL solicitada
   */
  public async solveChallenge(url: string, opts: {
    maxTimeout?: number;
    proxy?: string;
  } = {}): Promise<{
    html: string;
    cookies: string;
    userAgent: string;
    status: number;
  }> {
    const health = await this.checkHealth();
    if (!health.available) {
      throw new Error(`Serviço FlareSolverr indisponível em ${this.getEndpointUrl()}. Inicie o container FlareSolverr para desbloquear esta fonte.`);
    }

    const endpoint = this.getEndpointUrl();
    const domain = new URL(url).hostname;
    const session = this.sessions.get(domain);

    const payload: any = {
      cmd: 'request.get',
      url,
      maxTimeout: opts.maxTimeout || 60000,
    };

    if (session) {
      payload.session = session.sessionId;
    }

    const res = await this.client.post<FlareSolverrResponse>(endpoint, payload);
    const data = res.data;

    if (data.status !== 'ok' || !data.solution) {
      throw new Error(`FlareSolverr falhou ao resolver Cloudflare para ${url}: ${data.message || 'Desafio não solucionado'}`);
    }

    const sol = data.solution;
    const cookieHeader = (sol.cookies || [])
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    return {
      html: sol.response,
      cookies: cookieHeader,
      userAgent: sol.userAgent,
      status: sol.status,
    };
  }

  /**
   * Limpa sessões ativas
   */
  public async clearSessions(): Promise<void> {
    const endpoint = this.getEndpointUrl();
    for (const [domain, s] of this.sessions.entries()) {
      try {
        await this.client.post(endpoint, { cmd: 'sessions.destroy', session: s.sessionId }, { timeout: 5000 });
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
  }
}

export const flareSolverrService = FlareSolverrService.getInstance();
