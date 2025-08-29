import { refreshTokens } from '@/shared/utils/sessions/refresh-tokens';
import type { RefreshTokensSchema } from './schemas';

export async function refreshTokensUseCase({ refreshToken }: RefreshTokensSchema) {
  const { accessToken, refreshToken: newRefreshToken } = await refreshTokens(refreshToken);

  return {
    accessToken,
    refreshToken: newRefreshToken
  };
}
