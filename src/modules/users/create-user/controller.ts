import Elysia from 'elysia';
import {
  createUserConflictErrorSchema,
  createUserSchema,
  createUserSuccessSchema
} from './schemas';
import { createUserUseCase } from './use-case';

export const createUserController = new Elysia().post(
  '/',
  async ({ body, status }) => {
    const user = await createUserUseCase({
      email: body.email.toLowerCase(),
      name: body.name,
    });

    return status(201, {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  },
  {
    tags: ['users'],
    body: createUserSchema,
    response: {
      201: createUserSuccessSchema,
      409: createUserConflictErrorSchema
    }
  }
);
