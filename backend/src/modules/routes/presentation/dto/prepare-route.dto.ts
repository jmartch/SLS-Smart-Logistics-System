import { RouteValidationError } from '../../domain/route-errors';

export interface PrepareRouteBody {
  readonly depotConfirmed: boolean;
}

export function validatePrepareRouteBody(body: unknown): PrepareRouteBody {
  if (!body || typeof body !== 'object') {
    throw new RouteValidationError('Request body must be an object');
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.depotConfirmed !== 'boolean') {
    throw new RouteValidationError(
      '"depotConfirmed" boolean property is mandatory',
    );
  }

  return {
    depotConfirmed: raw.depotConfirmed,
  };
}
