import { t } from 'elysia';

export const refreshTokensSchema = t.Object({
  refreshToken: t.String()
});

export type RefreshTokensSchema = typeof refreshTokensSchema.$infer;
