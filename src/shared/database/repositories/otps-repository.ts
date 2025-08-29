import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '..';
import { type OTP, otps } from '../schemas/otps';
import type { Transaction } from '../transaction';

class OTPSRepository {
  async findById(id: OTP['id']) {
    const opt = await db.select().from(otps).where(eq(otps.id, id));

    if (!opt[0]) return null;

    return opt[0];
  }

  async findUnusedByUserId(userId: OTP['userId']) {
    const opt = await db
      .select()
      .from(otps)
      .where(and(eq(otps.userId, userId), isNull(otps.usedAt)))
      .orderBy(desc(otps.createdAt))
      .limit(1);

    if (!opt[0]) return null;

    return opt[0];
  }

  async findByUserId(userId: OTP['userId']) {
    const opt = await db
      .select()
      .from(otps)
      .where(eq(otps.userId, userId))
      .orderBy(desc(otps.createdAt))
      .limit(1);

    if (!opt[0]) return null;

    return opt[0];
  }

  async findAllUnusedByEmail(userId: OTP['userId']) {
    const codes = await db
      .select()
      .from(otps)
      .where(and(eq(otps.userId, userId), isNull(otps.usedAt)));

    return codes;
  }

  async deleteAllUnusedByEmail(userId: OTP['userId'], tx?: Transaction) {
    await (tx ?? db).delete(otps).where(and(eq(otps.userId, userId), isNull(otps.usedAt)));
  }

  async create(otp: Pick<OTP, 'userId' | 'code'>, tx?: Transaction) {
    const [createdOpt] = await (tx ?? db).insert(otps).values(otp).returning();

    return createdOpt;
  }

  async markAsUsed(id: OTP['id']) {
    await db.update(otps).set({ usedAt: new Date() }).where(eq(otps.id, id));
  }

  async delete(id: OTP['id']) {
    await db.delete(otps).where(eq(otps.id, id));
  }
}

export const otpsRepository = new OTPSRepository();
