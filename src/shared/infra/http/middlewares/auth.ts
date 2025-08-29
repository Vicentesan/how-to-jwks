import { isAfter } from 'date-fns';
import { Elysia } from 'elysia';

import sessionsRepository from '@/shared/database/repositories/sessions-repository';
import { usersRepository } from '@/shared/database/repositories/users-repository';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
import { refreshTokens } from '@/shared/utils/sessions/refresh-tokens';
import { validateAccessToken } from '@/shared/utils/sessions/validate-access-token';
import { validateRefreshToken } from '@/shared/utils/sessions/validate-refresh-token';

export const auth = new Elysia().derive({ as: 'scoped' }, async ({ headers, set }) => {
  const authorizationHeader = headers.authorization;
  const refreshTokenHeader = headers['x-refresh-token'];

  if (!authorizationHeader) {
    throw new UnauthorizedError('Authorization header is required');
  }

  const [bearer, accessToken] = authorizationHeader.split(' ');

  if (bearer !== 'Bearer' || !accessToken) {
    throw new UnauthorizedError('Invalid authorization format. Expected: Bearer <token>');
  }

  const {
    userId: accessUserId,
    sessionId: accessSessionId,
    isValid: isAccessValid
  } = await validateAccessToken(accessToken);

  if (isAccessValid && accessUserId && accessSessionId) {
    const session = await sessionsRepository.findByToken(accessToken);

    if (!session) {
      throw new UnauthorizedError('Session not found');
    }

    if (session.userId !== accessUserId || session.id !== accessSessionId) {
      throw new UnauthorizedError('Session mismatch');
    }

    if (session.status !== 'active') {
      throw new UnauthorizedError('Session is not active');
    }

    if (isAfter(new Date(), new Date(session.expiresAt))) {
      throw new UnauthorizedError('Session has expired');
    }

    const user = await usersRepository.findById(accessUserId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return {
      accessToken,
      refreshToken: null,
      session,
      user,
      isAuthenticated: true,
      tokensRefreshed: false
    };
  }

  if (!refreshTokenHeader) {
    throw new UnauthorizedError('Access token expired and no refresh token provided');
  }

  try {
    const {
      userId: refreshUserId,
      sessionId: refreshSessionId,
      isValid: isRefreshValid
    } = await validateRefreshToken(refreshTokenHeader);

    if (!isRefreshValid || !refreshUserId || !refreshSessionId) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      session
    } = await refreshTokens(refreshTokenHeader);

    const user = await usersRepository.findById(refreshUserId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    set.headers['x-new-access-token'] = newAccessToken;
    set.headers['x-new-refresh-token'] = newRefreshToken;

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      session,
      user,
      isAuthenticated: true,
      tokensRefreshed: true
    };
  } catch {
    throw new UnauthorizedError('Failed to refresh tokens');
  }
});
