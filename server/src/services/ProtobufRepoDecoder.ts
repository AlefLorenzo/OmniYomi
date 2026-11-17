import protobuf from 'protobufjs';
import zlib from 'zlib';
import { RepoExtension, RepoExtensionSource } from '../types/index.js';

export interface ProtobufRepoIndex {
  name: string;
  badgeLabel?: string;
  signingKey?: string;
  extensionListUrl?: string;
  extensions: RepoExtension[];
}

function decompress(buffer: Buffer): Buffer {
  try {
    return zlib.gunzipSync(buffer);
  } catch {
    return buffer;
  }
}

function absoluteAssetUrl(value: string, repoUrl: string): string {
  if (!value) return '';
  try {
    return new URL(value, repoUrl).toString();
  } catch {
    return value;
  }
}

export function decodeProtobufRepoIndex(buffer: Buffer, repoUrl: string): ProtobufRepoIndex {
  const reader = protobuf.Reader.create(decompress(buffer));
  const base = new URL(repoUrl);
  let name = base.hostname;
  let badgeLabel: string | undefined;
  let signingKey: string | undefined;
  let extensionListUrl: string | undefined;
  let extensionListBytes: Uint8Array | null = null;

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    const wire = tag & 7;

    if (field === 1 && wire === 2) name = reader.string();
    else if (field === 2 && wire === 2) badgeLabel = reader.string();
    else if (field === 3 && wire === 2) signingKey = reader.string();
    else if (field === 101 && wire === 2) extensionListBytes = reader.bytes();
    else if (field === 102 && wire === 2) extensionListUrl = absoluteAssetUrl(reader.string(), repoUrl);
    else reader.skipType(wire);
  }

  const extensions = extensionListBytes
    ? decodeProtobufExtensionList(Buffer.from(extensionListBytes), repoUrl, name, signingKey)
    : [];

  return { name, badgeLabel, signingKey, extensionListUrl, extensions };
}

export function decodeProtobufExtensionList(
  buffer: Buffer,
  repoUrl: string,
  repoName?: string,
  signingKey?: string,
): RepoExtension[] {
  const reader = protobuf.Reader.create(decompress(buffer));
  const base = new URL(repoUrl);
  const directoryUrl = repoUrl.substring(0, repoUrl.lastIndexOf('/') + 1);
  const extensions: RepoExtension[] = [];

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    const wire = tag & 7;

    if (field !== 1 || wire !== 2) {
      reader.skipType(wire);
      continue;
    }

    const extReader = protobuf.Reader.create(reader.bytes());
    let name = '';
    let pkg = '';
    let apkUrl = '';
    let iconUrl = '';
    let extensionLib = '1.4';
    let versionCode = 0;
    let version = '1.0.0';
    let contentWarning = 0;
    const sources: RepoExtensionSource[] = [];

    while (extReader.pos < extReader.len) {
      const extTag = extReader.uint32();
      const extField = extTag >>> 3;
      const extWire = extTag & 7;

      if (extField === 1 && extWire === 2) {
        name = extReader.string();
      } else if (extField === 2 && extWire === 2) {
        pkg = extReader.string();
      } else if (extField === 3 && extWire === 2) {
        const resourceReader = protobuf.Reader.create(extReader.bytes());
        while (resourceReader.pos < resourceReader.len) {
          const resourceTag = resourceReader.uint32();
          const resourceField = resourceTag >>> 3;
          const resourceWire = resourceTag & 7;
          if (resourceField === 1 && resourceWire === 2) apkUrl = resourceReader.string();
          else if (resourceField === 2 && resourceWire === 2) iconUrl = resourceReader.string();
          else resourceReader.skipType(resourceWire);
        }
      } else if (extField === 4 && extWire === 2) {
        extensionLib = extReader.string();
      } else if (extField === 5 && extWire === 0) {
        versionCode = Number(extReader.uint64().toString()) || 0;
      } else if (extField === 6 && extWire === 2) {
        version = extReader.string();
      } else if (extField === 7 && extWire === 0) {
        contentWarning = extReader.uint32();
      } else if (extField === 8 && extWire === 2) {
        const sourceReader = protobuf.Reader.create(extReader.bytes());
        let sourceId = '';
        let sourceName = '';
        let sourceLang = 'all';
        let sourceBaseUrl = '';

        while (sourceReader.pos < sourceReader.len) {
          const sourceTag = sourceReader.uint32();
          const sourceField = sourceTag >>> 3;
          const sourceWire = sourceTag & 7;
          if (sourceField === 1 && sourceWire === 0) sourceId = sourceReader.uint64().toString();
          else if (sourceField === 2 && sourceWire === 2) sourceName = sourceReader.string();
          else if (sourceField === 3 && sourceWire === 2) sourceLang = sourceReader.string();
          else if (sourceField === 4 && sourceWire === 2) sourceBaseUrl = sourceReader.string();
          else sourceReader.skipType(sourceWire);
        }

        if (sourceId) {
          sources.push({
            id: sourceId,
            name: sourceName || name,
            lang: sourceLang,
            baseUrl: sourceBaseUrl,
          });
        }
      } else {
        extReader.skipType(extWire);
      }
    }

    if (!pkg) continue;
    const languages = Array.from(new Set(sources.map((source) => source.lang).filter(Boolean)));
    const lang = languages.length === 1 ? languages[0] : 'all';
    const fallbackIcon = new URL('icon/' + pkg + '.png', directoryUrl).toString();

    extensions.push({
      id: pkg,
      pkg,
      name: name || pkg,
      version,
      extensionLib,
      versionCode,
      lang,
      iconUrl: iconUrl ? absoluteAssetUrl(iconUrl, repoUrl) : fallbackIcon,
      apkUrl: absoluteAssetUrl(apkUrl, repoUrl),
      isNsfw: contentWarning === 3,
      repoUrl,
      repoName: repoName || base.hostname,
      signingKey,
      sources,
      isInstalled: false,
      isExtracted: false,
    });
  }

  return extensions;
}

export function decodeProtobufRepo(buffer: Buffer, repoUrl: string): RepoExtension[] {
  return decodeProtobufRepoIndex(buffer, repoUrl).extensions;
}
