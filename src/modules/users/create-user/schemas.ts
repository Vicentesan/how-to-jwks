import { t } from 'elysia';

export const createUserSchema = t.Object({
  name: t.String({
    minLength: 3,
    maxLength: 255,
    examples: ['John Doe']
  }),
  email: t.String({
    format: 'email',
    examples: ['john.doe@acme.inc']
  })
});

export type CreateUserSchema = typeof createUserSchema.static;

export const createUserConflictErrorSchema = t.Object({
  code: t.Literal('CONFLICT'),
  message: t.Literal('User already exists')
});

export const createUserSuccessSchema = t.Object({
  id: t.String({ format: 'uuid' }),

  name: t.String(),
  email: t.String({ format: 'email' }),

  createdAt: t.Date(),
  updatedAt: t.Nullable(t.Date())
});
