import { envs } from '@/shared/config/envs';
import sessionsRepository from '@/shared/database/repositories/sessions-repository';
import { executeTransaction } from '@/shared/database/transaction';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { createAccessToken } from './create-access-token';
import { createRefreshToken } from './create-refresh-token';
import { validateRefreshToken } from './validate-refresh-token';

/**
 * Refreshes both access and refresh tokens for a valid session
 * @param refreshToken - The current refresh token to validate and use for refresh
 * @returns Promise containing new access token, refresh token, and session data
 */
export async function refreshTokens(refreshToken: string) {
  return await executeTransaction(async (tx) => {
    const { userId, sessionId, isValid } = await validateRefreshToken(refreshToken);

    if (!isValid || !userId || !sessionId) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const session = await sessionsRepository.findByRefreshToken(refreshToken);

    if (!session) {
      throw new UnauthorizedError('Session not found');
    }

    if (session.userId !== userId || session.id !== sessionId) {
      throw new UnauthorizedError('Session mismatch');
    }

    if (session.status !== 'active') {
      throw new UnauthorizedError('Session is not active');
    }

    const { accessToken: newAccessToken } = await createAccessToken({
      userId,
      sessionId: session.id
    });

    const { refreshToken: newRefreshToken } = await createRefreshToken({
      userId,
      sessionId: session.id
    });

    await sessionsRepository.update(
      session.id,
      {
        expiresAt: new Date(Date.now() + envs.app.ACCESS_TOKEN_EXPIRY_MS),
        refreshedAt: new Date()
      },
      tx
    );

    await sessionsRepository.updateToken(session.id, newAccessToken, tx);
    await sessionsRepository.updateRefreshToken(session.id, newRefreshToken, tx);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      session
    };
  });
}
