import { and, eq } from 'drizzle-orm';
import { db } from '..';
import type { User } from '../schemas';
import { type Session, sessions } from '../schemas/sessions';
import type { Transaction } from '../transaction';

class DrizzleSessionsRepository {
  async findById(id: Session['id']) {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));

    return session ?? null;
  }

  async findSessionByIdIpAndUserAgent({ id, userId }: { id: Session['id']; userId: User['id'] }) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));

    return session ?? null;
  }

  async create(
    session: Pick<Session, 'userId' | 'token' | 'refreshToken' | 'expiresAt'>,
    tx?: Transaction
  ) {
    const [createdSession] = await (tx ?? db).insert(sessions).values(session).returning();

    return createdSession;
  }

  async update(
    sessionId: Session['id'],
    session: Partial<Pick<Session, 'expiresAt' | 'refreshedAt'>>,
    tx?: Transaction
  ) {
    const [updatedSession] = await (tx ?? db)
      .update(sessions)
      .set(session)
      .where(eq(sessions.id, sessionId))
      .returning();

    return updatedSession;
  }

  async updateRefreshedAt(id: Session['id'], refreshedAt: Session['refreshedAt']) {
    const [updatedSession] = await db
      .update(sessions)
      .set({ refreshedAt })
      .where(eq(sessions.id, id))
      .returning();

    return updatedSession;
  }

  async updateToken(sessionId: string, token: string, tx?: Transaction) {
    const [updatedSession] = await (tx ?? db)
      .update(sessions)
      .set({ token })
      .where(eq(sessions.id, sessionId))
      .returning();
    return updatedSession;
  }

  async updateRefreshToken(sessionId: string, refreshToken: string, tx?: Transaction) {
    const [updatedSession] = await (tx ?? db)
      .update(sessions)
      .set({ refreshToken })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updatedSession;
  }

  async findByRefreshToken(refreshToken: string) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshToken, refreshToken));

    return session ?? null;
  }

  async findAllByUserId(userId: User['id']) {
    const allSessions = await db.select().from(sessions).where(eq(sessions.userId, userId));

    return allSessions;
  }

  async findByToken(token: string) {
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token));

    return session ?? null;
  }

  async revokeSession(sessionId: Session['id']) {
    const [updatedSession] = await db
      .update(sessions)
      .set({ status: 'revoked' })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updatedSession;
  }

  async revokeAllUserSessions(userId: User['id']) {
    await db.update(sessions).set({ status: 'revoked' }).where(eq(sessions.userId, userId));
  }

  async revokeOldestSession(userId: User['id']) {
    const [oldestSession] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, 'active')))
      .orderBy(sessions.createdAt)
      .limit(1);

    if (oldestSession) await this.revokeSession(oldestSession.id);

    return oldestSession;
  }

  async countActiveSessions(userId: User['id']) {
    const activeSessions = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, 'active')));

    return activeSessions.length;
  }
}

export default new DrizzleSessionsRepository();
