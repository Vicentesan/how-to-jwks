export class ConflictError extends Error {
  constructor(message?: string) {
    super(message ?? 'Conflict.');
    this.name = 'ConflictError';
  }
}
