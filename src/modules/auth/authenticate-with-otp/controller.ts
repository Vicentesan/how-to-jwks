import Elysia, { t } from 'elysia';
import { envs } from '@/shared/config/envs';
import { authenticateWithOTPSchema } from './schemas';
import { authenticateUserWithOtpUseCase } from './use-case';

export const authenticateUserWithOtpController = new Elysia().post(
  '/login',
  async ({ body, status, cookie }) => {
    const { accessToken, refreshToken } = await authenticateUserWithOtpUseCase({
      code: body.code,
      email: body.email.toLowerCase()
    });

    cookie.accessToken.set({
      value: accessToken,
      httpOnly: true,
      maxAge: envs.app.ACCESS_TOKEN_EXPIRY_MS * 1000,
      path: '/'
    });

    cookie.refreshToken.set({
      value: refreshToken,
      httpOnly: true,
      maxAge: envs.app.REFRESH_TOKEN_EXPIRY_MS * 1000,
      path: '/'
    });

    return status(204, null);
  },
  {
    tags: ['auth'],
    security: [],
    body: authenticateWithOTPSchema,
    response: {
      204: t.Null()
    }
  }
);
