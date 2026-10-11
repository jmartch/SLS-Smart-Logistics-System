import { RouteState } from '../../domain/route-state';
import { RouteValidationError } from '../../domain/route-errors';
import { ListRoutesQuery } from '../../application/ports/route-contracts';

const VALID_ROUTE_STATES = new Set<string>(Object.values(RouteState));

export function validateAndBuildListQuery(
  tenantId: string,
  actorUserId: string,
  correlationId: string,
  query: Record<string, unknown>,
): ListRoutesQuery {
  const page = query.page !== undefined ? Number(query.page) : 1;
  if (isNaN(page) || page < 1 || !Number.isInteger(page)) {
    throw new RouteValidationError('"page" must be a positive integer');
  }

  const pageSize = query.pageSize !== undefined ? Number(query.pageSize) : 20;
  if (
    isNaN(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isInteger(pageSize)
  ) {
    throw new RouteValidationError(
      '"pageSize" must be an integer between 1 and 100',
    );
  }

  let state: RouteState | undefined;
  if (query.state !== undefined) {
    if (typeof query.state !== 'string') {
      throw new RouteValidationError('Invalid state filter');
    }
    const rawState = query.state.toUpperCase();
    if (!VALID_ROUTE_STATES.has(rawState)) {
      throw new RouteValidationError(`Invalid state filter: "${query.state}"`);
    }
    state = rawState as RouteState;
  }

  const from =
    typeof query.from === 'string' && query.from.trim()
      ? query.from
      : undefined;
  const to =
    typeof query.to === 'string' && query.to.trim() ? query.to : undefined;
  const zoneId =
    typeof query.zoneId === 'string' && query.zoneId.trim()
      ? query.zoneId
      : undefined;
  const courierId =
    typeof query.courierId === 'string' && query.courierId.trim()
      ? query.courierId
      : undefined;

  return {
    tenantId,
    actorUserId,
    correlationId,
    page,
    pageSize,
    from,
    to,
    zoneId,
    state,
    courierId,
  };
}
