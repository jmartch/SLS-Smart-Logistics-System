import { type EventEnvelope, type JsonValue } from './event-envelope';
import { type CanonicalProducer, isCanonicalProducer } from './event-catalog';
import { MESSAGING_ERROR_CODES, MessagingError } from './messaging-errors';
import { EventValidator } from './event-validator';

export interface RawOutboxEventRecord {
  readonly id?: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly correlationId?: string | null;
  readonly eventType: string;
  readonly version?: number | null;
  readonly payload: unknown;
  readonly producer?: string | null;
  readonly occurredAt: Date | string;
}

export class OutboxEventMapper {
  /**
   * Normaliza un registro de base de datos a un EventEnvelope canónico validado.
   */
  static toEnvelope(record: RawOutboxEventRecord): EventEnvelope {
    if (!record || typeof record !== 'object') {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        'Outbox record must be an object',
      );
    }

    // 1. Parsear payload si viene como string JSON
    let parsedPayload: unknown = record.payload;
    if (typeof record.payload === 'string') {
      try {
        parsedPayload = JSON.parse(record.payload);
      } catch (err: unknown) {
        throw new MessagingError(
          MESSAGING_ERROR_CODES.EVENT_INVALID_JSON,
          `Failed to parse outbox payload as JSON: ${err instanceof Error ? err.message : String(err)}`,
          'payload',
        );
      }
    }

    if (
      parsedPayload === null ||
      typeof parsedPayload !== 'object' ||
      Array.isArray(parsedPayload)
    ) {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        'Outbox payload must be a non-null object',
        'payload',
      );
    }

    const payloadObj = parsedPayload as Record<string, unknown>;

    // 2. Detección de contradicciones de identidad entre columnas y payload
    if (
      payloadObj.tenantId !== undefined &&
      payloadObj.tenantId !== record.tenantId
    ) {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
        `Contradiction: payload tenantId '${String(payloadObj.tenantId)}' does not match record tenantId '${record.tenantId}'`,
        'tenantId',
      );
    }

    if (
      payloadObj.eventType !== undefined &&
      payloadObj.eventType !== record.eventType
    ) {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
        `Contradiction: payload eventType '${String(payloadObj.eventType)}' does not match record eventType '${record.eventType}'`,
        'eventType',
      );
    }

    const effectiveVersion =
      record.version && record.version > 0 ? record.version : 1;
    if (
      payloadObj.version !== undefined &&
      payloadObj.version !== effectiveVersion
    ) {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
        `Contradiction: payload version '${String(payloadObj.version)}' does not match record version '${effectiveVersion}'`,
        'version',
      );
    }

    // 3. Fallback determinista de correlationId (no generar UUIDs aleatorios al vuelo)
    const effectiveCorrelationId =
      record.correlationId && record.correlationId.trim() !== ''
        ? record.correlationId
        : record.eventId;

    // 4. Formateo determinista de occurredAt a ISO 8601 UTC
    let formattedOccurredAt: string;
    if (record.occurredAt instanceof Date) {
      if (Number.isNaN(record.occurredAt.getTime())) {
        throw new MessagingError(
          MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
          'occurredAt is an invalid Date object',
          'occurredAt',
        );
      }
      formattedOccurredAt = record.occurredAt.toISOString();
    } else if (typeof record.occurredAt === 'string') {
      const parsedDate = new Date(record.occurredAt);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new MessagingError(
          MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
          `occurredAt string '${record.occurredAt}' is not a valid date`,
          'occurredAt',
        );
      }
      formattedOccurredAt = parsedDate.toISOString();
    } else {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        'occurredAt must be a Date or ISO date string',
        'occurredAt',
      );
    }

    // 5. Inferencia / Extracción de producer
    const resolvedProducer = this.resolveProducer(record, payloadObj);

    // 6. Limpieza y normalización de payload operativo
    const normalizedPayload = this.normalizePayload(
      record.eventType,
      resolvedProducer,
      payloadObj,
    );

    // 7. Ensamblar y validar envelope final
    const envelopeCandidate: EventEnvelope = {
      eventId: record.eventId,
      tenantId: record.tenantId,
      correlationId: effectiveCorrelationId,
      eventType: record.eventType,
      occurredAt: formattedOccurredAt,
      producer: resolvedProducer,
      version: effectiveVersion,
      payload: normalizedPayload as JsonValue,
    };

    return EventValidator.assertValid(envelopeCandidate);
  }

  /**
   * Resuelve el producer canónico a partir de columnas, payload incrustado o eventType.
   */
  private static resolveProducer(
    record: RawOutboxEventRecord,
    payloadObj: Record<string, unknown>,
  ): CanonicalProducer {
    if (record.producer && record.producer.trim() !== '') {
      if (!isCanonicalProducer(record.producer)) {
        throw new MessagingError(
          MESSAGING_ERROR_CODES.OUTBOX_LEGACY_EVENT_AMBIGUOUS,
          `Unknown producer in outbox record: '${record.producer}'`,
          'producer',
        );
      }
      return record.producer;
    }

    if (
      typeof payloadObj.producer === 'string' &&
      payloadObj.producer.trim() !== ''
    ) {
      if (!isCanonicalProducer(payloadObj.producer)) {
        throw new MessagingError(
          MESSAGING_ERROR_CODES.OUTBOX_LEGACY_EVENT_AMBIGUOUS,
          `Unknown producer in payload: '${payloadObj.producer}'`,
          'producer',
        );
      }
      return payloadObj.producer;
    }

    switch (record.eventType) {
      case 'PackageDelivered':
      case 'DeliveryAttempted':
      case 'DeliveryFailed':
        // Si no tiene producer explícito y tiene attemptId o routeStopId, es deliveries
        if (payloadObj.attemptId || payloadObj.routeStopId) {
          return 'sls-backend.deliveries';
        }
        // Si tiene fromState y toState, es packages
        if (payloadObj.fromState && payloadObj.toState) {
          return 'sls-backend.packages';
        }
        // Por defecto PackageDelivered sin attemptId se inclina por deliveries si coincide con schema
        return 'sls-backend.deliveries';

      case 'RoutePrepared':
      case 'RouteStarted':
      case 'RouteCompleted':
      case 'RouteCancelled':
      case 'RouteInterrupted':
      case 'RouteStateChanged':
        return 'sls-backend.routes';

      case 'RoutePlanningCompleted':
      case 'RoutePlanningFailed':
        return 'sls-backend.route-planning';

      case 'PackageRegistered':
      case 'PackageClassified':
      case 'PackagePendingAssignment':
      case 'PackageAssigned':
      case 'PackageReadyForDispatch':
      case 'PackageInTransit':
      case 'PackageOutForDelivery':
      case 'PackageRescheduled':
      case 'PackageReturnPending':
      case 'PackageReturned':
      case 'PackageCancelled':
      case 'PackageTransitioned':
        // Puede provenir de packages o route-planning si aggregateId está presente
        if (payloadObj.planningRequestId) {
          return 'sls-backend.route-planning';
        }
        return 'sls-backend.packages';

      default:
        throw new MessagingError(
          MESSAGING_ERROR_CODES.OUTBOX_LEGACY_EVENT_AMBIGUOUS,
          `Cannot unambiguously determine producer for eventType '${record.eventType}' without producer column`,
          'producer',
        );
    }
  }

  /**
   * Limpia metadatos redundantes y normaliza formatos específicos por productor.
   */
  private static normalizePayload(
    eventType: string,
    producer: CanonicalProducer,
    payloadObj: Record<string, unknown>,
  ): Record<string, unknown> {
    const cleanPayload = { ...payloadObj };

    // Si packages incrustó 'producer', lo removemos del payload operativo
    if (producer === 'sls-backend.packages' && 'producer' in cleanPayload) {
      delete cleanPayload.producer;
    }

    // Si route-planning o packages guardó aggregateId en vez de packageId, normalizamos
    if (cleanPayload.aggregateId && !cleanPayload.packageId) {
      cleanPayload.packageId = cleanPayload.aggregateId;
      delete cleanPayload.aggregateId;
    }

    // Si routes emitió '{ domainEvent: { ... } }', desenvolvemos
    if (
      producer === 'sls-backend.routes' &&
      cleanPayload.domainEvent &&
      typeof cleanPayload.domainEvent === 'object'
    ) {
      return cleanPayload.domainEvent as Record<string, unknown>;
    }

    return cleanPayload;
  }
}
