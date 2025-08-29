import { otpsRepository } from '@/shared/database/repositories/otps-repository';
import { validateOTP } from '@/shared/utils/otp/validate-otp';
import { createUserSession } from '@/shared/utils/sessions/create-user-session';
import type { AuthenticateWithOTPSchema } from './schemas';

export async function authenticateUserWithOtpUseCase({ email, code }: AuthenticateWithOTPSchema) {
  const { id: otpId, userId: validatedUserId } = await validateOTP(email, code);
  await otpsRepository.markAsUsed(otpId);

  return await createUserSession(validatedUserId);
}
