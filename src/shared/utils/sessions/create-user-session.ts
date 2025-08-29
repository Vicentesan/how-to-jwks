import { envs } from '@/shared/config/envs';
import sessionsRepository from '@/shared/database/repositories/sessions-repository';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { createAccessToken } from './create-access-token';
import { createRefreshToken } from './create-refresh-token';

const MAX_CONCURRENT_SESSIONS = 5;

export async function createUserSession(userId: string) {
  // check current active sessions
  const activeSessionCount = await sessionsRepository.countActiveSessions(userId);

  // if user has too many sessions, revoke the oldest one
  if (activeSessionCount >= MAX_CONCURRENT_SESSIONS) {
    await sessionsRepository.revokeOldestSession(userId);
  }

  const { accessToken } = await createAccessToken({
    userId,
    sessionId: crypto.randomUUID()
  });

  const { refreshToken } = await createRefreshToken({
    userId,
    sessionId: crypto.randomUUID()
  });

  const session = await sessionsRepository.create({
    userId,
    token: accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + envs.app.ACCESS_TOKEN_EXPIRY_MS)
  });

  if (!session) throw new UnauthorizedError('Failed to create session');

  return {
    accessToken,
    refreshToken
  };
}
