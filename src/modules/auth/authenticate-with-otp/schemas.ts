import { type Static, t } from 'elysia';

export const authenticateWithOTPSchema = t.Object({
  code: t.String({ minLength: 6, maxLength: 6 }),
  email: t.String({ format: 'email' })
});

export type AuthenticateWithOTPSchema = Static<typeof authenticateWithOTPSchema>;
