import { webcrypto } from 'node:crypto';

// The Ed25519 publisher check shared by signed Workers releases and signed
// Pages release contracts. The caller supplies keys it selected from its own
// trusted configuration; nothing a payload carries can add one. `domain` is the
// exact byte prefix of the signed message: null for a Workers release, whose
// manifest bytes are signed raw, and the Pages prefix for a Pages contract, so
// neither signature verifies in the other's place. No file or network access,
// so the hosted bundle can carry this module.
export async function verifiedKeyId(keys, signature, message, domain) {
  if (domain !== null && !Buffer.isBuffer(domain)) throw new TypeError('domain must be a Buffer or null');
  const signed = domain === null ? message : Buffer.concat([domain, message]);
  for (const key of keys) {
    const publicKey = await webcrypto.subtle.importKey('raw', Buffer.from(key.ed25519, 'base64'), { name: 'Ed25519' }, false, ['verify']);
    if (signature.length === 64 && await webcrypto.subtle.verify('Ed25519', publicKey, signature, signed)) return key.id;
  }
  return null;
}
