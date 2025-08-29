import { drizzle } from 'drizzle-orm/postgres-js';
import { envs } from '@/shared/config/envs';

import * as schema from './schemas/index';

export const db = drizzle(envs.db.DATABASE_URL, {
  schema,
  logger: envs.app.APP_ENV === 'dev'
});
