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

function releaseVersion(tagName: unknown): string | null {
  if (typeof tagName !== 'string') return null;
  const match = tagName.match(/^(?:android-)?v?(\d+\.\d+\.\d+)$/i);
  return match?.[1] || null;
}

function hasApkAsset(release: any): boolean {
  return Array.isArray(release?.assets) && release.assets.some((asset: any) =>
    typeof asset?.name === 'string' &&
    /-release\.apk$/i.test(asset.name) &&
    typeof asset.browser_download_url === 'string'
  );
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
 * Accept Android/legacy tags only when they contain a signed release APK.
 * Debug APKs are not update candidates because CI debug signing keys are ephemeral.
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
      .map((release: any) => ({ release, version: releaseVersion(release?.tag_name) }))
      .filter(({ release, version }: any) =>
        Boolean(version) && !release.draft && hasApkAsset(release)
      )
      .sort((a: any, b: any) =>
        isNewerVersion(b.version, a.version) ? 1 :
        isNewerVersion(a.version, b.version) ? -1 : 0
      );

    const latestEntry = androidReleases[0];
    const latest = latestEntry?.release;
    if (!latest) return null;

    const apkAssets = latest.assets.filter((asset: any) =>
      typeof asset.name === 'string' &&
      /-release\.apk$/i.test(asset.name) &&
      typeof asset.browser_download_url === 'string'
    );
    const apk = apkAssets[0];
    if (!apk) return null;

    const version = latestEntry.version;

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
