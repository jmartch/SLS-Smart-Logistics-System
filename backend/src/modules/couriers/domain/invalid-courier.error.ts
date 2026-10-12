export type CourierField = 'userId';

export type InvalidCourierReason = 'REQUIRED' | 'INVALID_FORMAT';

export class InvalidCourierError extends Error {
  constructor(
    readonly field: CourierField,
    readonly reason: InvalidCourierReason,
  ) {
    super(`${field}:${reason}`);
    this.name = 'InvalidCourierError';
  }
}
