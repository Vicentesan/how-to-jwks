import Elysia, { t } from 'elysia';
import { refreshTokensSchema } from './schemas';
import { refreshTokensUseCase } from './use-case';

export const refreshTokensController = new Elysia().post(
  '/refresh',
  async ({ body, status, cookie }) => {
    const { accessToken, refreshToken } = await refreshTokensUseCase(body.refreshToken);

    cookie.accessToken.set({
      value: accessToken,
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
      path: '/'
    });

    cookie.refreshToken.set({
      value: refreshToken,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    return status(204, null);
  },
  {
    tags: ['auth'],
    security: [],
    body: refreshTokensSchema,
    response: {
      204: t.Null()
    }
  }
);
