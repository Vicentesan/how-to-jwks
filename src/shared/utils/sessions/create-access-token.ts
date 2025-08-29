import * as jose from 'jose';

import { envs } from '@/shared/config/envs';
import { getActivePrivateKeyAndKid } from './keys';

interface CreateAccessTokenOptions {
  userId: string;
  sessionId: string;
}

export async function createAccessToken(options: CreateAccessTokenOptions) {
  const { userId, sessionId } = options;

  const { key, kid } = await getActivePrivateKeyAndKid();

  const accessToken = await new jose.SignJWT({
    sub: userId,
    jti: sessionId
  })
    .setIssuedAt()
    .setIssuer(envs.app.ISSUER)
    .setExpirationTime(Date.now() + envs.app.ACCESS_TOKEN_EXPIRY_MS)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .sign(key);

  return { accessToken };
}
