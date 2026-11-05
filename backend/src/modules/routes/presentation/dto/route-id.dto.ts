import { RouteValidationError } from '../../domain/route-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRouteId(id: unknown): string {
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    throw new RouteValidationError(
      `Invalid route ID: "${String(id)}" is not a valid UUID`,
    );
  }
  return id;
}
