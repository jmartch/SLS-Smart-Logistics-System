import { InvalidCourierError } from './invalid-courier.error';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeCourierUserId(value: unknown): string {
  if (value === undefined || value === null) {
    throw new InvalidCourierError('userId', 'REQUIRED');
  }

  if (typeof value !== 'string') {
    throw new InvalidCourierError('userId', 'INVALID_FORMAT');
  }

  const userId = value.trim();

  if (userId.length === 0) {
    throw new InvalidCourierError('userId', 'REQUIRED');
  }

  if (!UUID_PATTERN.test(userId)) {
    throw new InvalidCourierError('userId', 'INVALID_FORMAT');
  }

  return userId.toLowerCase();
}
