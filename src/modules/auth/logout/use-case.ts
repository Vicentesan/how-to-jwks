import sessionsRepository from '@/shared/database/repositories/sessions-repository';

interface LogoutUseCaseParams {
  sessionId: string;
}

export async function logoutUseCase({ sessionId }: LogoutUseCaseParams) {
  await sessionsRepository.revokeSession(sessionId);
}
