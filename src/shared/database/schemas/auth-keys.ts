import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const authKeys = pgTable('auth_keys', {
  kid: text('kid').primaryKey(),
  pem: text('pem').notNull(),
  alg: text('alg').notNull().default('RS256'),
  use: text('use').notNull().default('sig'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  active: boolean('active').notNull().default(false),
  deactivatedAt: timestamp('deactivated_at'),
  revokedAt: timestamp('revoked_at')
});

export type AuthKey = typeof authKeys.$inferSelect;
