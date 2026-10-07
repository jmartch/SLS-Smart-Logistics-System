export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface EventEnvelope<
  TType extends string = string,
  TVersion extends number = number,
  TPayload extends JsonValue = JsonValue,
> {
  readonly eventId: string; // Stable UUID v4
  readonly tenantId: string; // UUID v4 from trusted context
  readonly correlationId: string; // UUID v4 from original operation
  readonly eventType: TType;
  readonly occurredAt: string; // Strict ISO 8601 UTC string
  readonly producer: string; // Logical canonical identifier
  readonly version: TVersion;
  readonly payload: TPayload;
}

export type PackageDeliveredPayload = {
  readonly packageId: string;
  readonly routeId: string;
  readonly stopId: string;
  readonly attemptId: string;
};

export type PackageDeliveredV1 = EventEnvelope<
  'PackageDelivered',
  1,
  PackageDeliveredPayload
>;

export interface ProcessingIdentity {
  readonly tenantId: string;
  readonly eventId: string;
  readonly consumerName: string;
}

export type EventValidationResult<T = EventEnvelope> =
  | { readonly kind: 'VALID'; readonly event: T }
  | {
      readonly kind: 'INVALID';
      readonly code: string;
      readonly field?: string;
      readonly message: string;
    };
