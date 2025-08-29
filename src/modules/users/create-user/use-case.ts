import { usersRepository } from '@/shared/database/repositories/users-repository';
import { ConflictError } from '@/shared/errors/conflict-error';
import type { CreateUserSchema } from './schemas';

export async function createUserUseCase(data: CreateUserSchema) {
  const userWithSameEmailAlreadyExists = await usersRepository.findByEmail(data.email);

  if (userWithSameEmailAlreadyExists) throw new ConflictError('User already exists');

  return await usersRepository.create({
    email: data.email,
    name: data.name
  });
}
