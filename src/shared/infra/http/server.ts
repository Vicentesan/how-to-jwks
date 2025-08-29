import { Elysia } from 'elysia';
import { userRoutes } from '@/modules/users/routes';
import { envs } from '@/shared/config/envs';
import { BadRequestError } from '@/shared/errors/bad-request-error';
import { ConflictError } from '@/shared/errors/conflict-error';
import { ResourceNotFoundError } from '@/shared/errors/resource-not-found-error';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';

export const app = new Elysia()
  .error({
    UNAUTHORIZED: UnauthorizedError,
    RESOURCE_NOT_FOUND: ResourceNotFoundError,
    CONFLICT: ConflictError,
    BAD_REQUEST: BadRequestError
  })
  .onError(({ error, code, status }) => {
    switch (code) {
      case 'CONFLICT': {
        return status(409, { code, message: error.message });
      }
      case 'RESOURCE_NOT_FOUND': {
        return status(404, { code, message: error.message });
      }
      case 'UNAUTHORIZED': {
        return status(401, { code, message: error.message });
      }
      case 'BAD_REQUEST': {
        return status(400, { code, message: error.message });
      }
      case 'VALIDATION': {
        const validationErrors: Record<string, string> = {};

        if (error.validator) {
          for (const err of error.validator.Errors(error.value)) {
            const path = err.path.replace(/^\//, ''); // Remove leading slash
            validationErrors[path] = err.message;
          }
        }

        return status(422, {
          code,
          message: 'Validation Failed',
          error: validationErrors,
          status: error.status
        });
      }
      case 'NOT_FOUND': {
        return status(404, {
          code,
          message: 'Not Found',
          status: error.status
        });
      }
      default: {
        console.error(error);
        return status(500, {
          code,
          message: 'Internal Server Error'
        });
      }
    }
  })
  .use(userRoutes);

app.listen(envs.app.PORT, () => console.log('HTTP server running'));
