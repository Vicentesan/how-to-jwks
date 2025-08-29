import { getJWKS } from '@/shared/utils/sessions/keys';

export async function getJwksUseCase() {
  return getJWKS();
}
