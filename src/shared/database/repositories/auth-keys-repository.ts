import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/shared/database';
import { authKeys } from '@/shared/database/schemas';

export const authKeysRepository = {
  async create(params: { kid: string; pem: string; alg?: string; use?: string; active?: boolean }) {
    const [row] = await db
      .insert(authKeys)
      .values({
        kid: params.kid,
        pem: params.pem,
        alg: params.alg ?? 'RS256',
        use: params.use ?? 'sig',
        active: params.active ?? false
      })
      .returning();

    return row;
  },

  async findByKid(kid: string) {
    const [row] = await db.select().from(authKeys).where(eq(authKeys.kid, kid));

    return row ?? null;
  },

  async getActive() {
    const [row] = await db.select().from(authKeys).where(eq(authKeys.active, true));

    return row ?? null;
  },

  async listRecent(limit = 5) {
    const rows = await db.select().from(authKeys).orderBy(desc(authKeys.createdAt)).limit(limit);

    return rows;
  },

  async setActive(kid: string) {
    await db.update(authKeys).set({ active: false }).where(eq(authKeys.active, true));

    const [row] = await db
      .update(authKeys)
      .set({ active: true, deactivatedAt: null })
      .where(eq(authKeys.kid, kid))
      .returning();

    return row;
  },

  async deactivate(kid: string) {
    const [row] = await db
      .update(authKeys)
      .set({ active: false, deactivatedAt: new Date() })
      .where(eq(authKeys.kid, kid))
      .returning();
    return row;
  },

  async revoke(kid: string) {
    const [row] = await db
      .update(authKeys)
      .set({ revokedAt: new Date(), active: false })
      .where(eq(authKeys.kid, kid))
      .returning();

    return row;
  },

  async listPublicJwks(limit = 5) {
    const rows = await db
      .select({
        kid: authKeys.kid,
        pem: authKeys.pem,
        alg: authKeys.alg,
        use: authKeys.use,
        revokedAt: authKeys.revokedAt
      })
      .from(authKeys)
      .where(isNull(authKeys.revokedAt))
      .orderBy(desc(authKeys.createdAt))
      .limit(limit);

    return rows;
  }
};
