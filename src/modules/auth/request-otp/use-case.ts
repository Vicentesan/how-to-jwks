import { isAfter } from 'date-fns';
import { otpsRepository } from '@/shared/database/repositories/otps-repository';
import { usersRepository } from '@/shared/database/repositories/users-repository';
import { ConflictError } from '@/shared/errors/conflict-error';
import { generateOTP } from '@/shared/utils/otp/generate-otp';
import type { RequestOtpSchema } from './schemas';

export async function requestOTPUseCase(data: RequestOtpSchema) {
  const user = await usersRepository.findByEmail(data.email);

  if (!user) throw new ConflictError('User not found');

  const anyCode = await otpsRepository.findByUserId(user.id);

  if (data.isResendCode && anyCode?.usedAt)
    throw new ConflictError('Email already verified. Please proceed to create your account.');

  const unusedCode = await otpsRepository.findUnusedByUserId(user.id);
  const isUnusedCodeValid = unusedCode ? isAfter(unusedCode.expiresAt, new Date()) : false;

  if (isUnusedCodeValid && unusedCode && !data.isResendCode)
    throw new ConflictError('A valid verification code already exists for this email');

  if (isUnusedCodeValid && unusedCode && data.isResendCode)
    await otpsRepository.delete(unusedCode.id);

  const otp = generateOTP();

  const { id } = await otpsRepository.create({
    code: otp,
    userId: user.id
  });

  // send email

  return {
    verifyEmailRequestId: id
  };
}
