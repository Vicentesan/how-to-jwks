import { eq } from 'drizzle-orm';
import { InternalServerError } from 'elysia';
import { db } from '..';
import { type User, users } from '../schemas';
import type { Transaction } from '../transaction';

class UsersRepository {
  async findById(id: User['id']) {
    const user = await db.select().from(users).where(eq(users.id, id));

    if (!user[0]) return null;

    return user[0];
  }

  async findByEmail(email: User['email']) {
    const user = await db.select().from(users).where(eq(users.email, email));

    if (!user[0]) return null;

    return user[0];
  }

  async update(id: User['id'], user: Partial<Pick<User, 'name' | 'email'>>, tx?: Transaction) {
    const updatedUser = await (tx ?? db)
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();

    if (!updatedUser) throw new InternalServerError();

    return updatedUser[0];
  }

  async create(user: Pick<User, 'name' | 'email'>, tx?: Transaction) {
    const createdUser = await (tx ?? db)
      .insert(users)
      .values({
        email: user.email,
        name: user.name
      })
      .returning();

    if (!createdUser[0]) throw new InternalServerError();

    return createdUser[0];
  }
}

export const usersRepository = new UsersRepository();
