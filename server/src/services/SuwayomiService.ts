import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

export class SuwayomiService {
  private static instance: SuwayomiService;
  private port: number = 4568;
  private baseUrl: string = 'http://127.0.0.1:4568';
  private process: ChildProcess | null = null;
  private isStarting: boolean = false;

  private get suwayomiDir(): string | null {
    const configured = process.env.SUWAYOMI_HOME || process.env.OMNIYOMI_SUWAYOMI_HOME;
    if (configured && configured.trim()) return path.resolve(configured.trim());

    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    const candidates = [
      resourcesPath ? path.join(resourcesPath, 'suwayomi') : null,
      path.resolve(process.cwd(), 'runtime', 'suwayomi'),
    ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find((candidate) =>
      fs.existsSync(path.join(candidate, 'bin', 'Suwayomi-Server.jar')) &&
      fs.existsSync(path.join(candidate, 'jre', 'bin', 'java.exe'))
    ) || candidates[0] || null;
  }

  public static getInstance(): SuwayomiService {
    if (!SuwayomiService.instance) {
      SuwayomiService.instance = new SuwayomiService();
    }
    return SuwayomiService.instance;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await this.restGet('/api/v1/settings/about');
      return Boolean(res && res.name?.includes('Suwayomi'));
    } catch {
      return false;
    }
  }

  public async ensureRunning(): Promise<boolean> {
    if (await this.isHealthy()) {
      return true;
    }

    if (this.isStarting) {
      // Wait up to 20 seconds for starting instance
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await this.isHealthy()) return true;
      }
      return false;
    }

    this.isStarting = true;
    console.log('[SuwayomiService] Inicializando runtime Suwayomi na porta 4568...');

    try {
      const runtimeDir = this.suwayomiDir;
      if (!runtimeDir) {
        console.warn('[SuwayomiService] Runtime opcional não configurado; o restante do OmniYomi continuará disponível.');
        this.isStarting = false;
        return false;
      }

      const javaPath = path.join(runtimeDir, 'jre', 'bin', 'java.exe');
      const jarPath = path.join(runtimeDir, 'bin', 'Suwayomi-Server.jar');

      if (!fs.existsSync(javaPath) || !fs.existsSync(jarPath)) {
        console.warn('[SuwayomiService] Runtime Suwayomi não encontrado em', runtimeDir);
        this.isStarting = false;
        return false;
      }

      const args = [
        '-Djava.awt.headless=true',
        '--add-exports=java.desktop/sun.awt=ALL-UNNAMED',
        '--enable-native-access=ALL-UNNAMED',
        '-jar',
        jarPath,
      ];

      this.process = spawn(javaPath, args, {
        detached: false,
        stdio: 'ignore',
        windowsHide: true,
      });

      const ownedProcess = this.process;
      ownedProcess.on('error', (err) => {
        console.error('[SuwayomiService] Erro no subprocesso Java:', err.message);
      });
      ownedProcess.on('exit', () => {
        if (this.process === ownedProcess) this.process = null;
      });

      // Wait until responsive
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await this.isHealthy()) {
          console.log('[SuwayomiService] Suwayomi Server pronto e operacional na porta 4568!');
          this.isStarting = false;
          return true;
        }
      }
    } catch (err: any) {
      console.error('[SuwayomiService] Falha ao iniciar Suwayomi Server:', err.message);
    }

    this.isStarting = false;
    return false;
  }

  public async stop(): Promise<void> {
    const child = this.process;
    if (!child) return;

    this.process = null;
    if (child.exitCode !== null) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null) {
          try { child.kill(); } catch { /* process may already have exited */ }
        }
        resolve();
      }, 8000);

      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        child.kill();
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  public restGet(pathUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: pathUrl,
          method: 'GET',
          timeout: 20000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(data);
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout na requisição Suwayomi'));
      });
      req.end();
    });
  }

  public queryGql(query: string, variables: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ query, variables });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: '/api/graphql',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
          timeout: 45000,
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (parsed.errors && parsed.errors.length > 0) {
                reject(new Error(parsed.errors[0].message || 'GraphQL Error'));
              } else {
                resolve(parsed.data);
              }
            } catch (e: any) {
              reject(new Error(`Falha ao analisar resposta GraphQL: ${body.slice(0, 200)}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout na requisição GraphQL'));
      });
      req.write(payload);
      req.end();
    });
  }
}

export const suwayomiService = SuwayomiService.getInstance();
