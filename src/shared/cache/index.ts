import Redis from 'ioredis';
import { envs } from '@/shared/config/envs';

export const redis = new Redis(envs.redis.REDIS_URL);
