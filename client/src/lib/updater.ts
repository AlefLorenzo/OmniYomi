export const GITHUB_OWNER = 'AlefLorenzo';
export const GITHUB_REPO = 'OmniYomi';
declare const __APP_VERSION__: string;
export const CURRENT_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== '0.0.0'
    ? __APP_VERSION__
    : '1.1.5';

export interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
  hasUpdate: boolean;
}

function versionParts(value: string): number[] {
  return value.replace(/^android-v/i, '').replace(/^v/i, '').split('.').map(part => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

export function isNewerVersion(latest: string, current: string): boolean {
  const left = versionParts(latest);
  const right = versionParts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * Android updater: only Android-tagged releases with an actual APK are eligible.
 * Desktop NSIS/portable releases are intentionally ignored.
 */
export async function checkForUpdate(): Promise<ReleaseInfo | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=100`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!response.ok) return null;

    const releases = await response.json();
    if (!Array.isArray(releases)) return null;

    const androidReleases = releases
      .filter((release: any) =>
        typeof release.tag_name === 'string' &&
        /^android-v\d+\.\d+\.\d+$/i.test(release.tag_name) &&
        !release.draft
      )
      .sort((a: any, b: any) =>
        isNewerVersion(a.tag_name, b.tag_name) ? -1 :
        isNewerVersion(b.tag_name, a.tag_name) ? 1 : 0
      );

    const latest = androidReleases.find((release: any) =>
      Array.isArray(release.assets) &&
      release.assets.some((asset: any) =>
        typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.apk') &&
        typeof asset.browser_download_url === 'string'
      )
    );
    if (!latest) return null;

    const apkAssets = latest.assets.filter((asset: any) =>
      typeof asset.name === 'string' &&
      asset.name.toLowerCase().endsWith('.apk') &&
      typeof asset.browser_download_url === 'string'
    );
    // Prefer the signed release APK when it exists; use debug only as a fallback.
    const apk = apkAssets.find((asset: any) => /-release\.apk$/i.test(asset.name)) || apkAssets[0];
    if (!apk) return null;

    const version = latest.tag_name.replace(/^android-v/i, '');

    return {
      version,
      downloadUrl: apk.browser_download_url,
      releaseNotes: latest.body || '',
      publishedAt: latest.published_at || '',
      hasUpdate: isNewerVersion(version, CURRENT_VERSION),
    };
  } catch {
    return null;
  }
}
