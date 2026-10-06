export abstract class RouteDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RouteNotFoundError extends RouteDomainError {
  readonly code = 'ROUTE_NOT_FOUND';

  constructor(routeId: string) {
    super(`Route with id '${routeId}' was not found`);
  }
}

export class RouteStateConflictError extends RouteDomainError {
  readonly code = 'ROUTE_STATE_CONFLICT';

  constructor(routeId: string, currentState: string, targetOperation: string) {
    super(
      `Route '${routeId}' is in state '${currentState}', which does not allow '${targetOperation}'`,
    );
  }
}

export class RouteManifestInvalidError extends RouteDomainError {
  readonly code = 'ROUTE_MANIFEST_INVALID';

  constructor(reason: string) {
    super(`Route manifest is invalid: ${reason}`);
  }
}

export class RouteResourceUnavailableError extends RouteDomainError {
  readonly code = 'ROUTE_RESOURCE_UNAVAILABLE';

  constructor(
    resourceType: 'VEHICLE' | 'COURIER' | 'DEPOT',
    resourceId: string,
    reason: string,
  ) {
    super(`${resourceType} resource '${resourceId}' is unavailable: ${reason}`);
  }
}

export class RouteForbiddenError extends RouteDomainError {
  readonly code = 'FORBIDDEN';

  constructor(
    message = 'Actor is not authorized to perform this route operation',
  ) {
    super(message);
  }
}

export class RouteConcurrencyConflictError extends RouteDomainError {
  readonly code = 'ROUTE_CONCURRENCY_CONFLICT';

  constructor(
    message = 'Concurrent modification detected during route transaction',
  ) {
    super(message);
  }
}

export class RouteValidationError extends RouteDomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
  }
}
