import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations';
import { db } from '@/shared/database';
import type * as schema from '@/shared/database/schemas';

export type Transaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export async function executeTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(callback);
}
