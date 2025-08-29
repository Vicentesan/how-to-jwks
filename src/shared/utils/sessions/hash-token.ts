import { createHash } from 'node:crypto';

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyTokenHash(token: string, hash: string) {
  const tokenHash = hashToken(token);

  return tokenHash === hash;
}
