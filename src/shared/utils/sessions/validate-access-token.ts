import * as jose from 'jose';
import { envs } from '@/shared/config/envs';
import { getLocalJwkSet } from './keys';

export async function validateAccessToken(token: string) {
  try {
    const jwkSet = await getLocalJwkSet();
    const { payload } = await jose.jwtVerify(token, jwkSet, {
      algorithms: ['RS256'],
      issuer: envs.app.ISSUER,
    });

    const userId = payload.sub as string;
    const sessionId = payload.jti as string;

    if (!userId || !sessionId) {
      return { userId: null, sessionId: null, isValid: false };
    }

    return {
      userId,
      sessionId,
      isValid: true
    };
  } catch {
    return { userId: null, sessionId: null, isValid: false };
  }
}
