import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const emailVerificationCodes = pgTable('email_verification_codes', {
  id: uuid('id').primaryKey().defaultRandom(),

  email: text('email').notNull(),

  code: text('code').notNull(),

  expiresAt: timestamp('expires_at').default(sql`now() + interval '24 hours'`).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  usedAt: timestamp('used_at')
});

export type EmailVerificationCodes = typeof emailVerificationCodes.$inferSelect;
