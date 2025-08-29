import Elysia from 'elysia';
import { requestOtpSchema, requestOtpSuccessSchema, verifyEmailConflictSchemas } from './schemas';
import { requestOTPUseCase } from './use-case';

export const requestOtpController = new Elysia().post(
  '/request-otp',
  async ({ body, status }) => {
    const { verifyEmailRequestId } = await requestOTPUseCase({
      email: body.email?.toLowerCase(),
      isResendCode: body.isResendCode
    });

    return status(201, { verifyEmailRequestId });
  },
  {
    tags: ['auth'],
    security: [],
    body: requestOtpSchema,
    response: {
      201: requestOtpSuccessSchema,
      409: verifyEmailConflictSchemas
    }
  }
);
