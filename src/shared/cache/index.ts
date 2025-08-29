import Redis from 'ioredis';
import { envs } from '@/shared/config/envs';

let client: Redis | null = null;

export function getRedis() {
  if (!client) client = new Redis(envs.redis.REDIS_URL);

  return client;
}
