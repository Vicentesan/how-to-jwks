import Elysia from 'elysia';
import { createUserController } from './create-user/controller';

export const userRoutes = new Elysia({ prefix: '/users' }).use(createUserController);
