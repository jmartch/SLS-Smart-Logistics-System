import { CourierValidationError } from '../../domain/courier-errors';
import type { CourierListQuery } from '../../application/ports/courier-management.port';

export function parseListCouriersQuery(
  raw: Record<string, unknown>,
): CourierListQuery {
  const integer = (field: string, fallback: number, max: number) => {
    if (raw[field] === undefined) return fallback;
    if (typeof raw[field] !== 'string' || !/^\d+$/.test(raw[field]))
      throw new CourierValidationError(`Invalid ${field}`, field);
    const value = Number(raw[field]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new CourierValidationError(`Invalid ${field}`, field);
    return value;
  };
  if (
    raw.status !== undefined &&
    raw.status !== 'ACTIVE' &&
    raw.status !== 'INACTIVE'
  )
    throw new CourierValidationError('Invalid status', 'status');
  if (
    raw.search !== undefined &&
    (typeof raw.search !== 'string' || raw.search.trim().length > 100)
  )
    throw new CourierValidationError('Invalid search', 'search');
  return {
    page: integer('page', 1, 1000000),
    pageSize: integer('pageSize', 20, 100),
    status: raw.status,
    search:
      typeof raw.search === 'string'
        ? raw.search.trim() || undefined
        : undefined,
  };
}
