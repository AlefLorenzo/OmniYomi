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

  private suwayomiDir: string =
    'C:\\Users\\Buggynay\\Downloads\\Suwayomi-Server-v2.4.2366-windows-x64\\Suwayomi-Server-v2.4.2366-windows-x64';

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
      const javaPath = path.join(this.suwayomiDir, 'jre', 'bin', 'java.exe');
      const jarPath = path.join(this.suwayomiDir, 'bin', 'Suwayomi-Server.jar');

      if (!fs.existsSync(javaPath) || !fs.existsSync(jarPath)) {
        console.error('[SuwayomiService] Binários do Suwayomi não encontrados em', this.suwayomiDir);
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

      this.process.on('error', (err) => {
        console.error('[SuwayomiService] Erro no subprocesso Java:', err.message);
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
