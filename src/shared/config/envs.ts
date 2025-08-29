import z from "zod"

export const envs = {
  app: loadAppEnvs(),
  db: loadDbEnvs(),
  redis: loadRedisEnvs(),
}

function loadAppEnvs() {
  const schema = z.object({
    APP_ENV: z.enum(['dev', 'prod']).default('dev'),
    PORT: z.coerce.number().default(3333),
    ISSUER: z.string().default('how-to-jwks'),
    JWKS_MAX_KEYS: z.coerce.number().default(5)
  })

  return schema.parse(process.env)
}

function loadDbEnvs() {
  const schema = z.object({
    DATABASE_URL: z.url()
  })

  return schema.parse(process.env)
}

function loadRedisEnvs() {
  const schema = z.object({
    REDIS_URL: z.url()
  })

  return schema.parse(process.env)
}