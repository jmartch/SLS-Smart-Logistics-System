import { BadRequestException } from '@nestjs/common';
import type { ListVehiclesQuery } from '../../application/ports/vehicle-query.port';
import type { VehicleStatusValue } from '../../application/ports/vehicle-repository.port';

function invalid(field: string): never {
  const message = `Invalid ${field}`;
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message,
    fields: { [field]: message },
  });
}

export function parseListVehiclesQuery(
  raw: Record<string, unknown>,
): ListVehiclesQuery {
  const integer = (field: string, fallback: number, max: number): number => {
    const value = raw[field];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value))
      return invalid(field);
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 1 || result > max)
      return invalid(field);
    return result;
  };
  const page = integer('page', 1, 1000000);
  const pageSize = integer('pageSize', 20, 100);
  let status: VehicleStatusValue | undefined;
  if (raw.status !== undefined) {
    if (
      raw.status !== 'ACTIVE' &&
      raw.status !== 'INACTIVE' &&
      raw.status !== 'MAINTENANCE'
    )
      invalid('status');
    status = raw.status as VehicleStatusValue;
  }
  if (
    raw.search !== undefined &&
    (typeof raw.search !== 'string' || raw.search.length > 100)
  )
    invalid('search');
  const search = typeof raw.search === 'string' ? raw.search.trim() : undefined;
  return { page, pageSize, status, search: search || undefined };
}
