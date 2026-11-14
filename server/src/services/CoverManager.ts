import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(__dirname, '../../../data/cache/covers');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export interface CoverValidationResult {
  valid: boolean;
  contentType?: string;
  sizeBytes?: number;
  cachedPath?: string;
  error?: string;
}

export class CoverManager {
  private static instance: CoverManager;

  public static getInstance(): CoverManager {
    if (!CoverManager.instance) {
      CoverManager.instance = new CoverManager();
    }
    return CoverManager.instance;
  }

  /**
   * Gera hash único e determinístico para a URL e referer da capa
   */
  public getCacheKey(imageUrl: string, referer?: string): string {
    const raw = `${imageUrl}::${referer || ''}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Obtém caminho em disco do arquivo em cache
   */
  public getCachedFilePath(cacheKey: string): string {
    return path.join(CACHE_DIR, `${cacheKey}.bin`);
  }

  /**
   * Valida os magic bytes de um buffer de imagem
   */
  public validateMagicBytes(buffer: Buffer): { valid: boolean; format?: string } {
    if (!buffer || buffer.length < 8) return { valid: false };

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { valid: true, format: 'image/jpeg' };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return { valid: true, format: 'image/png' };
    }

    // WEBP: RIFF ... WEBP
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { valid: true, format: 'image/webp' };
    }

    // GIF: GIF87a ou GIF89a
    if (buffer.toString('ascii', 0, 3) === 'GIF') {
      return { valid: true, format: 'image/gif' };
    }

    // AVIF
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 12) === 'ftypavif') {
      return { valid: true, format: 'image/avif' };
    }

    return { valid: false };
  }

  /**
   * Baixa e armazena a capa no cache local, validando a integridade
   */
  public async getOrFetchCover(imageUrl: string, referer?: string): Promise<{
    filePath: string;
    contentType: string;
    isCached: boolean;
  }> {
    if (!imageUrl || !imageUrl.startsWith('http')) {
      throw new Error('URL de capa inválida ou não suportada.');
    }

    const key = this.getCacheKey(imageUrl, referer);
    const cachedFile = this.getCachedFilePath(key);
    const metaFile = path.join(CACHE_DIR, `${key}.meta.json`);

    // Verificar se já está em cache
    if (fs.existsSync(cachedFile) && fs.existsSync(metaFile)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        return {
          filePath: cachedFile,
          contentType: meta.contentType || 'image/jpeg',
          isCached: true,
        };
      } catch {
        // se meta corrompido, refaz o download
      }
    }

    // Fazer download com headers adequados
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };
    if (referer) headers['Referer'] = referer;

    const res = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers,
      timeout: 20000,
      maxRedirects: 5,
    });

    const buffer = Buffer.from(res.data);
    const magic = this.validateMagicBytes(buffer);

    if (!magic.valid) {
      throw new Error('Arquivo baixado não é uma imagem válida (magic bytes corrompidos ou HTML retornado).');
    }

    const contentType = magic.format || String(res.headers['content-type'] || 'image/jpeg');

    // Gravar arquivo binário e metadados
    fs.writeFileSync(cachedFile, buffer);
    fs.writeFileSync(
      metaFile,
      JSON.stringify({
        url: imageUrl,
        referer,
        contentType,
        sizeBytes: buffer.length,
        cachedAt: Date.now(),
      }, null, 2),
      'utf-8'
    );

    return {
      filePath: cachedFile,
      contentType,
      isCached: false,
    };
  }

  /**
   * Limpa cache de capas expiradas
   */
  public cleanCache(): number {
    let count = 0;
    try {
      const files = fs.readdirSync(CACHE_DIR);
      for (const f of files) {
        fs.unlinkSync(path.join(CACHE_DIR, f));
        count++;
      }
    } catch {
      // ignore
    }
    return count;
  }
}

export const coverManager = CoverManager.getInstance();
