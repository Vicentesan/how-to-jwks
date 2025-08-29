import Elysia from 'elysia';
import { authenticateUserWithOtpController } from './authenticate-with-otp/controller';
import { jwksController } from './jkws/controller';
import { keysAdminController } from './keys/controller';
import { logoutController } from './logout/controller';
import { refreshTokensController } from './refresh-tokens/controller';
import { requestOtpController } from './request-otp/controller';

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(requestOtpController)
  .use(authenticateUserWithOtpController)
  .use(logoutController)
  .use(refreshTokensController)
  .use(jwksController)
  .use(keysAdminController);
