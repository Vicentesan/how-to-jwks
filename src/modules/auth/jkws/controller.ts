import Elysia from 'elysia';
import { getJWKS } from '@/shared/utils/sessions/keys';

export const jwksController = new Elysia().get(
  '/jwks',
  async () => {
    return getJWKS();
  },
  {
    tags: ['auth'],
    security: []
  }
);
