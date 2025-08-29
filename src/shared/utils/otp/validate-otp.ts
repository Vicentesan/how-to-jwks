import { isAfter } from 'date-fns';

import { otpsRepository } from '@/shared/database/repositories/otps-repository';
import { usersRepository } from '@/shared/database/repositories/users-repository';
import { ResourceNotFoundError } from '@/shared/errors/resource-not-found-error';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

export async function validateOTP(email: string, otp: string) {
  const user = await usersRepository.findByEmail(email);
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const queriedOTP = await otpsRepository.findUnusedByUserId(user.id);
  if (!queriedOTP) throw new ResourceNotFoundError('OTP not found');

  const validationErrors = [
    [queriedOTP.userId !== user.id, 'Invalid credentials'],
    [otp !== queriedOTP.code, 'Invalid OTP'],
    [isAfter(new Date(), new Date(queriedOTP.expiresAt)), 'OTP expired'],
    [queriedOTP.usedAt, 'OTP already used']
  ] as const;

  const error = validationErrors.find(([condition]) => condition);

  if (error) {
    if (error[1] === 'OTP expired') {
      await otpsRepository.delete(queriedOTP.id);
    }

    throw new UnauthorizedError(error[1]);
  }

  return { id: queriedOTP.id, userId: user.id };
}
