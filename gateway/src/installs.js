import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCanonicalMediaHost } from './media-download.js';

export const INSTALLS_FILE = 'installs.json';

/** Read the person's current label mapping only when asked to connect. */
export function createInstallOriginResolver(home) {
  return (service, label) => {
    if (!home) return undefined;
    let installs;
    try {
      installs = JSON.parse(readFileSync(join(home, INSTALLS_FILE), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
    if (!installs || typeof installs !== 'object' || Array.isArray(installs)) return null;
    if (!Object.hasOwn(installs, service)) return undefined;
    const labels = installs[service];
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return null;
    return Object.hasOwn(labels, label) ? labels[label] : undefined;
  };
}

export function installToolkitSlug(origin) {
  const hash = createHash('sha256').update(origin, 'utf8').digest('hex');
  return `WISERCRM_${hash.slice(0, 16).toUpperCase()}`;
}

export function canonicalInstallOrigin(value) {
  if (typeof value !== 'string') return null;
  // Check the original hostname before URL lowercases it or normalizes an IDN.
  const authority = /^https:\/\/([a-z0-9.-]+)(?::[0-9]+)?\/?$/.exec(value);
  if (!authority || authority[0] !== value) return null;
  const hostname = authority[1];
  if (!isCanonicalMediaHost(hostname) || /\.(localhost|local|internal)$/.test(hostname)) return null;
  // A browser can display an encoded IDN as Unicode when opening the link.
  if (hostname.split('.').some((label) => label.startsWith('xn--'))) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash || url.port || url.hostname !== hostname) return null;
  return url.origin;
}
