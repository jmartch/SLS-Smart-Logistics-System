export const CANONICAL_PRODUCERS = [
  'sls-backend.routes',
  'sls-backend.deliveries',
  'sls-backend.packages',
  'sls-backend.route-planning',
] as const;

export type CanonicalProducer = (typeof CANONICAL_PRODUCERS)[number];

export function isCanonicalProducer(
  producer: string,
): producer is CanonicalProducer {
  return (CANONICAL_PRODUCERS as readonly string[]).includes(producer);
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface PayloadValidationOutcome {
  readonly valid: boolean;
  readonly error?: string;
  readonly field?: string;
}

export interface EventDefinition {
  readonly eventType: string;
  readonly version: number;
  readonly supportedProducers: readonly CanonicalProducer[];
  readonly validatePayload: (
    payload: unknown,
    producer: CanonicalProducer,
  ) => PayloadValidationOutcome;
}

const EVENT_DEFINITIONS: readonly EventDefinition[] = [
  {
    eventType: 'PackageDelivered',
    version: 1,
    supportedProducers: ['sls-backend.deliveries', 'sls-backend.packages'],
    validatePayload: (payload, producer) => {
      if (!isObject(payload)) {
        return { valid: false, error: 'Payload must be an object' };
      }
      if (!isValidUuid(payload.packageId)) {
        return {
          valid: false,
          field: 'packageId',
          error: 'packageId must be a valid UUID',
        };
      }

      if (producer === 'sls-backend.deliveries') {
        if (!isValidUuid(payload.routeId)) {
          return {
            valid: false,
            field: 'routeId',
            error: 'routeId must be a valid UUID',
          };
        }
        if (!isValidUuid(payload.stopId)) {
          return {
            valid: false,
            field: 'stopId',
            error: 'stopId must be a valid UUID',
          };
        }
        if (!isValidUuid(payload.attemptId)) {
          return {
            valid: false,
            field: 'attemptId',
            error: 'attemptId must be a valid UUID',
          };
        }
      } else {
        // Variante de packages (State transition)
        if (
          typeof payload.fromState !== 'string' ||
          typeof payload.toState !== 'string'
        ) {
          return {
            valid: false,
            field: 'toState',
            error: 'fromState and toState must be strings',
          };
        }
      }

      return { valid: true };
    },
  },
  {
    eventType: 'DeliveryAttempted',
    version: 1,
    supportedProducers: ['sls-backend.deliveries'],
    validatePayload: (payload) => {
      if (!isObject(payload)) {
        return { valid: false, error: 'Payload must be an object' };
      }
      if (!isValidUuid(payload.packageId)) {
        return {
          valid: false,
          field: 'packageId',
          error: 'packageId must be a valid UUID',
        };
      }
      if (!isValidUuid(payload.routeStopId)) {
        return {
          valid: false,
          field: 'routeStopId',
          error: 'routeStopId must be a valid UUID',
        };
      }
      if (
        typeof payload.attemptNumber !== 'number' ||
        payload.attemptNumber < 1
      ) {
        return {
          valid: false,
          field: 'attemptNumber',
          error: 'attemptNumber must be a positive number',
        };
      }
      const allowedOutcomes = ['DELIVERED', 'FAILED', 'RESCHEDULED'];
      if (
        typeof payload.outcome !== 'string' ||
        !allowedOutcomes.includes(payload.outcome)
      ) {
        return {
          valid: false,
          field: 'outcome',
          error: `outcome must be one of: ${allowedOutcomes.join(', ')}`,
        };
      }
      return { valid: true };
    },
  },
  {
    eventType: 'DeliveryFailed',
    version: 1,
    supportedProducers: ['sls-backend.deliveries', 'sls-backend.packages'],
    validatePayload: (payload) => {
      if (!isObject(payload)) {
        return { valid: false, error: 'Payload must be an object' };
      }
      if (!isValidUuid(payload.packageId)) {
        return {
          valid: false,
          field: 'packageId',
          error: 'packageId must be a valid UUID',
        };
      }
      return { valid: true };
    },
  },
  // Eventos de ciclo de vida de Package
  ...[
    'PackageRegistered',
    'PackageClassified',
    'PackagePendingAssignment',
    'PackageAssigned',
    'PackageReadyForDispatch',
    'PackageInTransit',
    'PackageOutForDelivery',
    'PackageRescheduled',
    'PackageReturnPending',
    'PackageReturned',
    'PackageCancelled',
    'PackageTransitioned',
  ].map<EventDefinition>((eventType) => ({
    eventType,
    version: 1,
    supportedProducers: ['sls-backend.packages', 'sls-backend.route-planning'],
    validatePayload: (payload) => {
      if (!isObject(payload)) {
        return { valid: false, error: 'Payload must be an object' };
      }
      if (!isValidUuid(payload.packageId)) {
        return {
          valid: false,
          field: 'packageId',
          error: 'packageId must be a valid UUID',
        };
      }
      return { valid: true };
    },
  })),
  // Eventos de ciclo de vida de Route
  ...[
    'RoutePrepared',
    'RouteStarted',
    'RouteCompleted',
    'RouteCancelled',
    'RouteInterrupted',
    'RouteStateChanged',
  ].map<EventDefinition>((eventType) => ({
    eventType,
    version: 1,
    supportedProducers: ['sls-backend.routes'],
    validatePayload: (payload) => {
      if (!isObject(payload)) {
        return { valid: false, error: 'Payload must be an object' };
      }
      if (!isValidUuid(payload.routeId)) {
        return {
          valid: false,
          field: 'routeId',
          error: 'routeId must be a valid UUID',
        };
      }
      return { valid: true };
    },
  })),
  // Eventos de Route Planning
  ...['RoutePlanningCompleted', 'RoutePlanningFailed'].map<EventDefinition>(
    (eventType) => ({
      eventType,
      version: 1,
      supportedProducers: ['sls-backend.route-planning'],
      validatePayload: (payload) => {
        if (!isObject(payload)) {
          return { valid: false, error: 'Payload must be an object' };
        }
        if (!isValidUuid(payload.requestId)) {
          return {
            valid: false,
            field: 'requestId',
            error: 'requestId must be a valid UUID',
          };
        }
        return { valid: true };
      },
    }),
  ),
];

export function findEventDefinition(
  eventType: string,
  version: number,
): EventDefinition | undefined {
  return EVENT_DEFINITIONS.find(
    (def) => def.eventType === eventType && def.version === version,
  );
}
