export const GITHUB_OWNER = 'AlefLorenzo';
export const GITHUB_REPO = 'OmniYomi';
declare const __APP_VERSION__: string;
export const CURRENT_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== '0.0.0'
    ? __APP_VERSION__
    : '1.1.2';

export interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
  hasUpdate: boolean;
}

// Compara duas versões em formato semver (ex: "1.0.9" vs "1.0.8")
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);

  if (lMaj > cMaj) return true;
  if (lMaj < cMaj) return false;
  if (lMin > cMin) return true;
  if (lMin < cMin) return false;
  return lPat > cPat;
}

export async function checkForUpdate(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      // Se não houver releases no GitHub ainda, busca as tags
      const tagsRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/tags`,
        {
          headers: { Accept: 'application/vnd.github.v3+json' },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (tagsRes.ok) {
        const tags = await tagsRes.json();
        if (Array.isArray(tags) && tags.length > 0) {
          const latestTag = (tags[0].name || '').replace(/^v/, '');
          const hasUpdate = isNewerVersion(latestTag, CURRENT_VERSION);
          return {
            version: latestTag,
            downloadUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
            releaseNotes: `Nova tag v${latestTag} detectada no GitHub!`,
            publishedAt: new Date().toISOString(),
            hasUpdate,
          };
        }
      }
      return null;
    }

    const data = await res.json();
    const latestVersion = (data.tag_name || '').replace(/^v/, '');
    if (!latestVersion) return null;

    const hasUpdate = isNewerVersion(latestVersion, CURRENT_VERSION);
    const apkAsset = (data.assets || []).find((a: any) => a.name.endsWith('.apk'));

    return {
      version: latestVersion,
      downloadUrl: apkAsset?.browser_download_url || data.html_url,
      releaseNotes: data.body || '',
      publishedAt: data.published_at || '',
      hasUpdate,
    };
  } catch {
    return null;
  }
}
