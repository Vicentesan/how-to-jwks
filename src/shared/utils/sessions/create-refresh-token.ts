import * as jose from 'jose';
import { envs } from '@/shared/config/envs';
import { getActivePrivateKeyAndKid } from './keys';

interface CreateRefreshTokenOptions {
  userId: string;
  sessionId: string;
}

export async function createRefreshToken(options: CreateRefreshTokenOptions) {
  const { userId, sessionId } = options;

  const { key, kid } = await getActivePrivateKeyAndKid();

  const refreshToken = await new jose.SignJWT({
    sub: userId,
    jti: sessionId
  })
    .setIssuedAt()
    .setIssuer(envs.app.ISSUER)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .setExpirationTime(new Date(Date.now() + envs.app.REFRESH_TOKEN_EXPIRY_MS).toString())
    .sign(key);

  return { refreshToken };
}
