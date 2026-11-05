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

export class RouteCustodyUnresolvedError extends RouteDomainError {
    readonly code = 'ROUTE_CUSTODY_UNRESOLVED';

    constructor(
        message = 'Physical receipt must be confirmed for all active cargo before closing the route',
    ) {
        super(message);
    }
}

export class RouteManifestEmptyError extends RouteDomainError {
    readonly code = 'ROUTE_MANIFEST_EMPTY';

    constructor(routeId: string) {
        super(`Route '${routeId}' has an empty dispatch manifest`);
    }
}

export class RouteManifestInconsistentError extends RouteDomainError {
    readonly code = 'ROUTE_MANIFEST_INCONSISTENT';

    constructor(reason: string) {
        super(`Route manifest is inconsistent: ${reason}`);
    }
}

export class RouteHasPendingStopsError extends RouteDomainError {
    readonly code = 'ROUTE_HAS_PENDING_STOPS';

    constructor(routeId: string) {
        super(
            `Route '${routeId}' has pending stops that must be resolved before regular closure`,
        );
    }
}

export class RouteAlreadyCompletedError extends RouteDomainError {
    readonly code = 'ROUTE_ALREADY_COMPLETED';

    constructor(routeId: string) {
        super(`Route '${routeId}' is already completed`);
    }
}

export class RouteNotCompletedError extends RouteDomainError {
    readonly code = 'ROUTE_NOT_COMPLETED';

    constructor(routeId: string) {
        super(`Route '${routeId}' is not yet completed`);
    }
}

export class IdempotencyKeyReusedError extends RouteDomainError {
    readonly code = 'IDEMPOTENCY_KEY_REUSED';

    constructor(key: string) {
        super(
            `Idempotency key '${key}' was already used with different request parameters`,
        );
    }
}