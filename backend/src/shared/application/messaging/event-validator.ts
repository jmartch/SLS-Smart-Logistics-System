import {
  type EventEnvelope,
  type EventValidationResult,
  type JsonValue,
} from './event-envelope';
import { findEventDefinition, isCanonicalProducer } from './event-catalog';
import { MESSAGING_ERROR_CODES, MessagingError } from './messaging-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isValidIsoUtcDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC_REGEX.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isObject(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

export class EventValidator {
  /**
   * Valida un objeto desconocido contra las reglas canónicas del envelope.
   */
  static validate(raw: unknown): EventValidationResult<EventEnvelope> {
    if (!isObject(raw)) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        message: 'Event envelope must be a non-null object',
      };
    }

    if (!isValidUuid(raw.eventId)) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'eventId',
        message: 'eventId must be a valid UUID v4',
      };
    }

    if (!isValidUuid(raw.tenantId)) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'tenantId',
        message: 'tenantId must be a valid UUID v4',
      };
    }

    if (!isValidUuid(raw.correlationId)) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'correlationId',
        message: 'correlationId must be a valid UUID v4',
      };
    }

    if (typeof raw.eventType !== 'string' || raw.eventType.trim() === '') {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'eventType',
        message: 'eventType must be a non-empty string',
      };
    }

    if (!isValidIsoUtcDate(raw.occurredAt)) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'occurredAt',
        message:
          'occurredAt must be a valid ISO 8601 UTC date string (e.g. 2026-10-07T15:30:00.000Z)',
      };
    }

    if (
      typeof raw.producer !== 'string' ||
      !isCanonicalProducer(raw.producer)
    ) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'producer',
        message: `producer '${String(raw.producer)}' is not a recognized canonical producer`,
      };
    }

    if (
      typeof raw.version !== 'number' ||
      !Number.isInteger(raw.version) ||
      raw.version < 1
    ) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'version',
        message: 'version must be a positive integer',
      };
    }

    if (!isJsonValue(raw.payload)) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: 'payload',
        message:
          'payload must be a valid JSON value without undefined, NaN, or non-finite numbers',
      };
    }

    const definition = findEventDefinition(raw.eventType, raw.version);
    if (!definition) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_UNSUPPORTED_VERSION,
        field: 'eventType',
        message: `Unsupported event '${raw.eventType}' version ${raw.version}`,
      };
    }

    if (!definition.supportedProducers.includes(raw.producer)) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
        field: 'producer',
        message: `Producer '${raw.producer}' is not authorized to emit '${raw.eventType}' v${raw.version}`,
      };
    }

    const payloadValidation = definition.validatePayload(
      raw.payload,
      raw.producer,
    );
    if (!payloadValidation.valid) {
      return {
        kind: 'INVALID',
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        field: payloadValidation.field
          ? `payload.${payloadValidation.field}`
          : 'payload',
        message: payloadValidation.error ?? 'Payload failed validation',
      };
    }

    return {
      kind: 'VALID',
      event: {
        eventId: raw.eventId,
        tenantId: raw.tenantId,
        correlationId: raw.correlationId,
        eventType: raw.eventType,
        occurredAt: raw.occurredAt,
        producer: raw.producer,
        version: raw.version,
        payload: raw.payload,
      },
    };
  }

  static assertValid(raw: unknown): EventEnvelope {
    const result = EventValidator.validate(raw);
    if (result.kind === 'INVALID') {
      throw new MessagingError(result.code, result.message, result.field);
    }
    return result.event;
  }
}
