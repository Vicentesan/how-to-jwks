import { t } from 'elysia';

export const jwksResponseSchema = t.Object({
  keys: t.Array(
    t.Object({
      kty: t.String(),
      n: t.Optional(t.String()),
      e: t.Optional(t.String()),
      crv: t.Optional(t.String()),
      x: t.Optional(t.String()),
      y: t.Optional(t.String()),
      alg: t.String(),
      kid: t.String(),
      use: t.String()
    })
  )
});
