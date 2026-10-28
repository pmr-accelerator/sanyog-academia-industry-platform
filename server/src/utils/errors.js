// One error type used everywhere; the error handler turns it into a consistent JSON response.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg = 'Invalid request', details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Please sign in to continue') => new AppError(401, 'UNAUTHENTICATED', msg);
export const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg = 'Conflict', details) => new AppError(409, 'CONFLICT', msg, details);
