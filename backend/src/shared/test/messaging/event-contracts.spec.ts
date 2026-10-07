import { EventValidator } from '../../application/messaging/event-validator';
import {
  MESSAGING_ERROR_CODES,
  MessagingError,
} from '../../application/messaging/messaging-errors';
import type {
  EventEnvelope,
  PackageDeliveredV1,
} from '../../application/messaging/event-envelope';

describe('Event Contracts and Validation (T01, T02)', () => {
  const validTenantId = '51083af7-26d2-4b61-bb7e-9f46b3377811';
  const validEventId = '41d37449-68a4-4d23-a818-c793e2e51b36';
  const validCorrelationId = '57930541-1e44-42ac-8808-699da79b4364';

  const validPackageDelivered: PackageDeliveredV1 = {
    eventId: validEventId,
    tenantId: validTenantId,
    correlationId: validCorrelationId,
    eventType: 'PackageDelivered',
    occurredAt: '2026-10-07T15:30:00.000Z',
    producer: 'sls-backend.deliveries',
    version: 1,
    payload: {
      packageId: 'b71c9774-2703-456b-8938-e59f284ef28d',
      routeId: 'cc014364-a031-49eb-9356-2769ce04bfd5',
      stopId: '5b829274-5205-4c7a-bc31-9c19be365248',
      attemptId: '45f1cd3c-962d-4822-b65e-103d1b671baa',
    },
  };

  describe('T01: Envelope válido y serialización', () => {
    it('debe validar exitosamente un envelope canónico con los ocho campos obligatorios', () => {
      const result = EventValidator.validate(validPackageDelivered);

      expect(result.kind).toBe('VALID');
      if (result.kind === 'VALID') {
        expect(result.event).toEqual(validPackageDelivered);
        expect(result.event.eventId).toBe(validEventId);
        expect(result.event.tenantId).toBe(validTenantId);
        expect(result.event.correlationId).toBe(validCorrelationId);
        expect(result.event.eventType).toBe('PackageDelivered');
        expect(result.event.occurredAt).toBe('2026-10-07T15:30:00.000Z');
        expect(result.event.producer).toBe('sls-backend.deliveries');
        expect(result.event.version).toBe(1);
        expect(result.event.payload.packageId).toBe(
          'b71c9774-2703-456b-8938-e59f284ef28d',
        );
      }
    });

    it('assertValid debe devolver el envelope directamente cuando es válido', () => {
      const event = EventValidator.assertValid(validPackageDelivered);
      expect(event).toEqual(validPackageDelivered);
    });

    it('debe serializarse a JSON sin pérdida de campos ni valores undefined', () => {
      const jsonStr = JSON.stringify(validPackageDelivered);
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      expect(Object.keys(parsed).sort()).toEqual([
        'correlationId',
        'eventId',
        'eventType',
        'occurredAt',
        'payload',
        'producer',
        'tenantId',
        'version',
      ]);
      expect(EventValidator.validate(parsed).kind).toBe('VALID');
    });
  });

  describe('T02: Rechazo de envelope o metadatos inválidos', () => {
    it('debe rechazar un payload que no sea un objeto no nulo', () => {
      const result = EventValidator.validate(null);
      expect(result.kind).toBe('INVALID');
      if (result.kind === 'INVALID') {
        expect(result.code).toBe(MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE);
      }
    });

    it('debe rechazar eventId con formato no UUID', () => {
      const invalid = { ...validPackageDelivered, eventId: 'not-a-uuid' };
      const result = EventValidator.validate(invalid);
      expect(result.kind).toBe('INVALID');
      if (result.kind === 'INVALID') {
        expect(result.code).toBe(MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE);
        expect(result.field).toBe('eventId');
      }
    });

    it('debe rechazar tenantId con formato no UUID', () => {
      const invalid = { ...validPackageDelivered, tenantId: '12345' };
      const result = EventValidator.validate(invalid);
      expect(result.kind).toBe('INVALID');
      if (result.kind === 'INVALID') {
        expect(result.code).toBe(MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE);
        expect(result.field).toBe('tenantId');
      }
    });

    it('debe rechazar occurredAt que no sea una fecha ISO 8601 UTC estricta', () => {
      const invalidDates = [
        'invalid-date',
        '2026-10-07',
        '2026-10-07 15:30:00',
        '2026-10-07T15:30:00-05:00', // No termina en Z
      ];

      for (const badDate of invalidDates) {
        const invalid = { ...validPackageDelivered, occurredAt: badDate };
        const result = EventValidator.validate(invalid);
        expect(result.kind).toBe('INVALID');
        if (result.kind === 'INVALID') {
          expect(result.field).toBe('occurredAt');
        }
      }
    });

    it('debe rechazar versiones no enteras o menores a 1', () => {
      const invalidVersions = [0, -1, 1.5, '1'];
      for (const badVersion of invalidVersions) {
        const invalid = {
          ...validPackageDelivered,
          version: badVersion as number,
        };
        const result = EventValidator.validate(invalid);
        expect(result.kind).toBe('INVALID');
        if (result.kind === 'INVALID') {
          expect(result.field).toBe('version');
        }
      }
    });

    it('debe rechazar productores no canónicos', () => {
      const invalid = {
        ...validPackageDelivered,
        producer: 'unauthorized-service',
      };
      const result = EventValidator.validate(invalid);
      expect(result.kind).toBe('INVALID');
      if (result.kind === 'INVALID') {
        expect(result.field).toBe('producer');
      }
    });

    it('debe rechazar eventos no registrados en el catálogo', () => {
      const invalid = {
        ...validPackageDelivered,
        eventType: 'UnknownRandomEvent',
      };
      const result = EventValidator.validate(invalid);
      expect(result.kind).toBe('INVALID');
      if (result.kind === 'INVALID') {
        expect(result.code).toBe(
          MESSAGING_ERROR_CODES.EVENT_UNSUPPORTED_VERSION,
        );
      }
    });

    it('debe rechazar un evento emitido por un productor no autorizado para ese tipo', () => {
      // RouteStateChanged solo lo emite sls-backend.routes
      const invalid: EventEnvelope = {
        ...validPackageDelivered,
        eventType: 'RouteStateChanged',
        producer: 'sls-backend.deliveries',
        payload: { routeId: 'b71c9774-2703-456b-8938-e59f284ef28d' },
      };
      const result = EventValidator.validate(invalid);
      expect(result.kind).toBe('INVALID');
      if (result.kind === 'INVALID') {
        expect(result.code).toBe(MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH);
        expect(result.field).toBe('producer');
      }
    });

    it('debe rechazar cuando el payload no satisface el validador del evento', () => {
      const invalidPayload = {
        ...validPackageDelivered,
        payload: {
          packageId: 'b71c9774-2703-456b-8938-e59f284ef28d',
          // Faltan routeId, stopId, attemptId
        },
      };
      const result = EventValidator.validate(invalidPayload);
      expect(result.kind).toBe('INVALID');
      if (result.kind === 'INVALID') {
        expect(result.code).toBe(MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE);
        expect(result.field).toBe('payload.routeId');
      }
    });

    it('assertValid debe lanzar MessagingError con el código adecuado ante fallos', () => {
      const invalid = { ...validPackageDelivered, eventId: 'invalid' };
      expect(() => EventValidator.assertValid(invalid)).toThrow(MessagingError);
      try {
        EventValidator.assertValid(invalid);
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(MessagingError);
        expect((err as MessagingError).code).toBe(
          MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
        );
      }
    });
  });
});
