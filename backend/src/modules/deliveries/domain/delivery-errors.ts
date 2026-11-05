export abstract class DeliveryDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DeliveryValidationError extends DeliveryDomainError {
  readonly code = 'DELIVERY_VALIDATION_ERROR';

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export class DeliveryNotFoundError extends DeliveryDomainError {
  readonly code = 'DELIVERY_RESOURCE_NOT_FOUND';

  constructor(resourceId: string, resourceName = 'Delivery resource') {
    super(`${resourceName} with id '${resourceId}' was not found`);
  }
}

export class DeliveryForbiddenError extends DeliveryDomainError {
  readonly code = 'DELIVERY_FORBIDDEN';

  constructor(
    message = 'Actor is not authorized to perform this delivery operation',
  ) {
    super(message);
  }
}

export class DeliveryStateConflictError extends DeliveryDomainError {
  readonly code = 'DELIVERY_STATE_CONFLICT';
}

export class StopStateConflictError extends DeliveryDomainError {
  readonly code = 'STOP_STATE_CONFLICT';
}

export class IdempotencyConflictError extends DeliveryDomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor(requestId: string) {
    super(
      `Idempotency key '${requestId}' was already used with a different request payload or actor`,
    );
  }
}

export class DeliveryEvidenceValidationError extends DeliveryDomainError {
  readonly code = 'INVALID_EVIDENCE';

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}
