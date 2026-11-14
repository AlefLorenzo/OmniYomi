import protobuf from 'protobufjs';
import zlib from 'zlib';
import { RepoExtension, RepoExtensionSource } from '../types/index.js';

export function decodeProtobufRepo(buffer: Buffer, repoUrl: string): RepoExtension[] {
  let uncompressed = buffer;
  try {
    uncompressed = zlib.gunzipSync(buffer);
  } catch {
    // If not gzipped, keep original buffer
  }

  const reader = protobuf.Reader.create(uncompressed);
  let extListBytes: Uint8Array | null = null;
  const urlObj = new URL(repoUrl);
  const basePath = repoUrl.substring(0, repoUrl.lastIndexOf('/'));

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const fieldNo = tag >>> 3;
    const wireType = tag & 7;

    if (fieldNo === 101 && wireType === 2) {
      extListBytes = reader.bytes();
    } else {
      reader.skipType(wireType);
    }
  }

  if (!extListBytes) return [];

  const subReader = protobuf.Reader.create(extListBytes);
  const extensions: RepoExtension[] = [];

  while (subReader.pos < subReader.len) {
    const tag = subReader.uint32();
    const fieldNo = tag >>> 3;

    if (fieldNo === 1) {
      const extBytes = subReader.bytes();
      const itemReader = protobuf.Reader.create(extBytes);
      let name = '';
      let pkg = '';
      let version = '1.0.0';
      let isNsfw = false;
      let apkUrl = '';
      let iconUrl = '';
      const sources: RepoExtensionSource[] = [];

      while (itemReader.pos < itemReader.len) {
        const iTag = itemReader.uint32();
        const fNo = iTag >>> 3;
        const wType = iTag & 7;

        if (fNo === 1 && wType === 2) {
          name = itemReader.string();
        } else if (fNo === 2 && wType === 2) {
          pkg = itemReader.string();
        } else if (fNo === 3 && wType === 2) {
          const resBytes = itemReader.bytes();
          const rReader = protobuf.Reader.create(resBytes);
          while (rReader.pos < rReader.len) {
            const rTag = rReader.uint32();
            const rNo = rTag >>> 3;
            if (rNo === 1) apkUrl = rReader.string();
            else if (rNo === 2) iconUrl = rReader.string();
            else rReader.skipType(rTag & 7);
          }
        } else if (fNo === 6 && wType === 2) {
          version = itemReader.string();
        } else if (fNo === 7 && wType === 0) {
          isNsfw = itemReader.uint32() > 0;
        } else if (fNo === 8 && wType === 2) {
          const sBytes = itemReader.bytes();
          const sReader = protobuf.Reader.create(sBytes);
          let sId = '';
          let sName = '';
          let sLang = 'all';
          let sBaseUrl = '';

          while (sReader.pos < sReader.len) {
            const sTag = sReader.uint32();
            const sNo = sTag >>> 3;
            const swType = sTag & 7;

            if (sNo === 1 && swType === 0) {
              sId = sReader.uint64().toString();
            } else if (sNo === 2 && swType === 2) {
              sName = sReader.string();
            } else if (sNo === 3 && swType === 2) {
              sLang = sReader.string();
            } else if (sNo === 4 && swType === 2) {
              sBaseUrl = sReader.string();
            } else {
              sReader.skipType(swType);
            }
          }

          sources.push({
            id: sId,
            name: sName || name,
            lang: sLang,
            baseUrl: sBaseUrl,
          });
        } else {
          itemReader.skipType(wType);
        }
      }

      if (pkg) {
        if (!apkUrl.startsWith('http') && apkUrl) {
          apkUrl = `${basePath}/${apkUrl}`;
        }
        if (!iconUrl) {
          iconUrl = `${basePath}/icon/${pkg}.png`;
        } else if (!iconUrl.startsWith('http')) {
          iconUrl = `${basePath}/${iconUrl}`;
        }

        extensions.push({
          id: pkg,
          pkg,
          name: name || pkg,
          version,
          lang: sources[0]?.lang || 'all',
          iconUrl,
          apkUrl,
          isNsfw,
          repoUrl,
          repoName: urlObj.hostname,
          sources,
          isInstalled: false,
          isExtracted: false,
        });
      }
    } else {
      subReader.skipType(tag & 7);
    }
  }

  return extensions;
}
