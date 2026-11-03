export abstract class CourierDomainError extends Error {
  abstract readonly code: string;
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class CourierValidationError extends CourierDomainError {
  readonly code = 'VALIDATION_ERROR';
}
export class CourierNotFoundError extends CourierDomainError {
  readonly code = 'COURIER_NOT_FOUND';
  constructor() {
    super('Resource not found');
  }
}
export class CourierCommittedError extends CourierDomainError {
  readonly code = 'COURIER_COMMITTED';
  constructor() {
    super('Courier has active assignments or unclosed routes', 'status');
  }
}
export class CourierUserNotEligibleError extends CourierDomainError {
  readonly code = 'COURIER_USER_NOT_ELIGIBLE';
  constructor() {
    super('User must be active to activate the courier', 'status');
  }
}
export class CourierConcurrencyError extends CourierDomainError {
  readonly code = 'COURIER_CONCURRENCY_CONFLICT';
  constructor() {
    super('Concurrent modification detected during operation');
  }
}
export class CourierAlreadyLinkedError extends CourierDomainError {
  readonly code = 'COURIER_USER_ALREADY_LINKED';
  constructor() {
    super('User is already linked to a courier', 'userId');
  }
}
