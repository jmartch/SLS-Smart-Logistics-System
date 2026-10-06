import { RouteValidationError } from '../../domain/route-errors';

export interface CancelRouteBody {
  readonly reasonCode: string;
  readonly reason?: string;
}

export function validateCancelRouteBody(body: unknown): CancelRouteBody {
  if (!body || typeof body !== 'object') {
    throw new RouteValidationError('Request body must be an object');
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.reasonCode !== 'string' || !raw.reasonCode.trim()) {
    throw new RouteValidationError('"reasonCode" string is mandatory');
  }

  const reason =
    typeof raw.reason === 'string' && raw.reason.trim()
      ? raw.reason.trim()
      : undefined;

  return {
    reasonCode: raw.reasonCode.trim(),
    reason,
  };
}
