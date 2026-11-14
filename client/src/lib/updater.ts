export const GITHUB_OWNER = 'AlefLorenzo';
export const GITHUB_REPO = 'OmniYomi';
declare const __APP_VERSION__: string;
export const CURRENT_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

export async function checkForUpdate(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const latestVersion = (data.tag_name || '').replace(/^v/, '');
    if (!latestVersion || latestVersion === CURRENT_VERSION) return null;
    const apkAsset = (data.assets || []).find((a: any) => a.name.endsWith('.apk'));
    return {
      version: latestVersion,
      downloadUrl: apkAsset?.browser_download_url || data.html_url,
      releaseNotes: data.body || '',
      publishedAt: data.published_at || '',
    };
  } catch {
    return null;
  }
}
