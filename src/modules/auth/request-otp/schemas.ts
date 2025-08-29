import { type Static, t } from 'elysia';

export const requestOtpSchema = t.Object({
  email: t.String({
    format: 'email',
    examples: ['john.doe@acme.inc']
  }),
  isResendCode: t.Optional(t.Boolean({ default: false }))
});

export type RequestOtpSchema = Static<typeof requestOtpSchema>;

export const requestOtpSuccessSchema = t.Object({
  verifyEmailRequestId: t.String({ format: 'uuid' })
});

export const verifyEmailUnusedCodeFoundSchema = t.Object({
  code: t.Literal('CONFLICT'),
  message: t.Literal('A valid verification code already exists for this email')
});

export const verifyEmailUserFoundSchema = t.Object({
  code: t.Literal('RESOURCE_NOT_FOUND'),
  message: t.Literal('User not found')
});

export const verifyEmailConflictSchemas = t.Union([
  verifyEmailUserFoundSchema,
  verifyEmailUnusedCodeFoundSchema
]);
