import Elysia, { t } from 'elysia';
import { revokeKey, rotateKeys } from '@/shared/utils/sessions/keys';

export const keysAdminController = new Elysia({ prefix: '/keys' })
  .post(
    '/rotate',
    async () => {
      const { kid } = await rotateKeys();
      return { kid };
    },
    { tags: ['auth'], security: [] }
  )
  .post(
    '/:kid/revoke',
    async ({ params }) => {
      await revokeKey(params.kid);

      return { ok: true };
    },
    { params: t.Object({ kid: t.String() }), tags: ['auth'], security: [] }
  );
