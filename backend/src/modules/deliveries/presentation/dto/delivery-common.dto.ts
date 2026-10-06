import { randomUUID } from 'node:crypto';
import { DeliveryValidationError } from '../../domain/delivery-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(id: unknown, fieldName: string): string {
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    throw new DeliveryValidationError(
      `Invalid ${fieldName}: "${String(id)}" is not a valid UUID`,
      fieldName,
    );
  }
  return id;
}

export function extractIdempotencyKey(
  headers: Record<string, string | undefined>,
): string {
  const key = headers['idempotency-key'] ?? headers['x-idempotency-key'];
  if (key && typeof key === 'string' && key.trim()) {
    return key.trim();
  }
  return randomUUID();
}
