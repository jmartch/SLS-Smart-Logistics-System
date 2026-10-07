export const MESSAGING_ERROR_CODES = {
  EVENT_INVALID_JSON: 'EVENT_INVALID_JSON',
  EVENT_INVALID_ENVELOPE: 'EVENT_INVALID_ENVELOPE',
  EVENT_UNSUPPORTED_VERSION: 'EVENT_UNSUPPORTED_VERSION',
  EVENT_IDENTITY_MISMATCH: 'EVENT_IDENTITY_MISMATCH',
  EVENT_RETRIES_EXHAUSTED: 'EVENT_RETRIES_EXHAUSTED',
  EVENT_HANDLER_FAILURE: 'EVENT_HANDLER_FAILURE',
  OUTBOX_LEGACY_EVENT_AMBIGUOUS: 'OUTBOX_LEGACY_EVENT_AMBIGUOUS',
  BROKER_DELIVERY_LIMIT_EXCEEDED: 'BROKER_DELIVERY_LIMIT_EXCEEDED',
  PUBLISHER_CONFIRM_TIMEOUT: 'PUBLISHER_CONFIRM_TIMEOUT',
  PUBLISHER_NACK: 'PUBLISHER_NACK',
  PUBLISHER_UNROUTABLE: 'PUBLISHER_UNROUTABLE',
} as const;

export type MessagingErrorCode =
  (typeof MESSAGING_ERROR_CODES)[keyof typeof MESSAGING_ERROR_CODES];

export class MessagingError extends Error {
  constructor(
    readonly code: MessagingErrorCode | string,
    message: string,
    readonly field?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MessagingError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
