import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '..';
import { type EmailVerificationCodes, emailVerificationCodes, type User } from '../schemas';
import type { Transaction } from '../transaction';

class EmailVerificationCodesRepository {
  async findById(id: EmailVerificationCodes['id']) {
    const opt = await db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.id, id));

    if (!opt[0]) return null;

    return opt[0];
  }

  async findUnusedByEmail(email: User['email']) {
    const opt = await db
      .select()
      .from(emailVerificationCodes)
      .where(and(eq(emailVerificationCodes.email, email), isNull(emailVerificationCodes.usedAt)))
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1);

    if (!opt[0]) return null;

    return opt[0];
  }

  async findByEmail(email: User['email']) {
    const opt = await db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.email, email))
      .orderBy(desc(emailVerificationCodes.createdAt))
      .limit(1);

    if (!opt[0]) return null;

    return opt[0];
  }

  async findAllUnusedByEmail(email: User['email']) {
    const codes = await db
      .select()
      .from(emailVerificationCodes)
      .where(and(eq(emailVerificationCodes.email, email), isNull(emailVerificationCodes.usedAt)));

    return codes;
  }

  async deleteAllUnusedByEmail(email: User['email'], tx?: Transaction) {
    await (tx ?? db)
      .delete(emailVerificationCodes)
      .where(and(eq(emailVerificationCodes.email, email), isNull(emailVerificationCodes.usedAt)));
  }

  async create(otp: Pick<EmailVerificationCodes, 'email' | 'code'>, tx?: Transaction) {
    const [createdOpt] = await (tx ?? db).insert(emailVerificationCodes).values(otp).returning();

    return createdOpt;
  }

  async markAsUsed(id: EmailVerificationCodes['id']) {
    await db
      .update(emailVerificationCodes)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationCodes.id, id));
  }

  async delete(id: EmailVerificationCodes['id']) {
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.id, id));
  }
}

export const emailVerificationCodesRepository = new EmailVerificationCodesRepository();
