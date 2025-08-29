import Elysia, { t } from 'elysia';
import { auth } from '@/shared/infra/http/middlewares/auth';
import { logoutUseCase } from './use-case';

export const logoutController = new Elysia().use(auth).post(
  '/logout',
  async ({ session, cookie, status }) => {
    await logoutUseCase({ sessionId: session.id });

    cookie.accessToken.remove();
    cookie.refreshToken.remove();

    return status(204, null);
  },
  {
    tags: ['auth'],
    security: [{ bearerAuth: [] }],
    response: {
      204: t.Null()
    }
  }
);
