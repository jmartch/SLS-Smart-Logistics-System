import {
  OutboxEventMapper,
  type RawOutboxEventRecord,
} from '../../application/messaging/outbox-event.mapper';
import {
  MESSAGING_ERROR_CODES,
  MessagingError,
} from '../../application/messaging/messaging-errors';

describe('Outbox Event Mapper (T03)', () => {
  const tenantId = '51083af7-26d2-4b61-bb7e-9f46b3377811';
  const eventId = '41d37449-68a4-4d23-a818-c793e2e51b36';
  const correlationId = '57930541-1e44-42ac-8808-699da79b4364';
  const packageId = 'b71c9774-2703-456b-8938-e59f284ef28d';
  const routeId = 'cc014364-a031-49eb-9356-2769ce04bfd5';
  const stopId = '5b829274-5205-4c7a-bc31-9c19be365248';
  const attemptId = '45f1cd3c-962d-4822-b65e-103d1b671baa';

  describe('T03: Normalización de los cuatro productores existentes', () => {
    it('debe mapear un registro de deliveries con inferencia de productor y Date a ISO string', () => {
      const now = new Date('2026-10-07T15:30:00.000Z');
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        correlationId: null, // Prueba de fallback determinista
        eventType: 'PackageDelivered',
        version: 1,
        occurredAt: now,
        producer: null, // Aún no es columna en la BD actual
        payload: {
          packageId,
          routeId,
          stopId,
          attemptId,
        },
      };

      const envelope = OutboxEventMapper.toEnvelope(row);

      expect(envelope.eventId).toBe(eventId);
      expect(envelope.tenantId).toBe(tenantId);
      // Fallback determinista al eventId cuando correlationId es nulo
      expect(envelope.correlationId).toBe(eventId);
      expect(envelope.eventType).toBe('PackageDelivered');
      expect(envelope.occurredAt).toBe('2026-10-07T15:30:00.000Z');
      expect(envelope.producer).toBe('sls-backend.deliveries');
      expect(envelope.version).toBe(1);
      expect(envelope.payload).toEqual({
        packageId,
        routeId,
        stopId,
        attemptId,
      });
    });

    it('debe mapear un registro de packages extrayendo producer incrustado en el payload', () => {
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        correlationId,
        eventType: 'PackageTransitioned',
        version: 1,
        occurredAt: '2026-10-07T16:00:00.000Z',
        payload: {
          producer: 'sls-backend.packages',
          packageId,
          fromState: 'IN_TRANSIT',
          toState: 'OUT_FOR_DELIVERY',
          changedByUserId: null,
          reasonCode: null,
        },
      };

      const envelope = OutboxEventMapper.toEnvelope(row);

      expect(envelope.producer).toBe('sls-backend.packages');
      // Debe limpiar el producer incrustado del payload operativo
      expect(
        (envelope.payload as Record<string, unknown>).producer,
      ).toBeUndefined();
      expect((envelope.payload as Record<string, unknown>).packageId).toBe(
        packageId,
      );
      expect((envelope.payload as Record<string, unknown>).fromState).toBe(
        'IN_TRANSIT',
      );
    });

    it('debe mapear un registro de routes desenvolviendo domainEvent si está presente', () => {
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        correlationId,
        eventType: 'RoutePrepared',
        version: 1,
        occurredAt: '2026-10-07T16:30:00.000Z',
        payload: {
          domainEvent: {
            routeId,
            fromState: 'PLANNED',
            toState: 'READY',
          },
        },
      };

      const envelope = OutboxEventMapper.toEnvelope(row);

      expect(envelope.producer).toBe('sls-backend.routes');
      expect(envelope.payload).toEqual({
        routeId,
        fromState: 'PLANNED',
        toState: 'READY',
      });
    });

    it('debe mapear un registro de route-planning normalizando aggregateId a packageId', () => {
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        correlationId,
        eventType: 'PackageAssigned',
        version: 1,
        occurredAt: '2026-10-07T17:00:00.000Z',
        payload: {
          planningRequestId: '61a35567-c290-449e-b87e-2936a2839211',
          aggregateId: packageId,
          fromState: 'CLASSIFIED',
          toState: 'ASSIGNED_TO_ROUTE',
        },
      };

      const envelope = OutboxEventMapper.toEnvelope(row);

      expect(envelope.producer).toBe('sls-backend.route-planning');
      expect((envelope.payload as Record<string, unknown>).packageId).toBe(
        packageId,
      );
      expect(
        (envelope.payload as Record<string, unknown>).aggregateId,
      ).toBeUndefined();
    });

    it('debe parsear payloads serializados como string JSON en la base de datos', () => {
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        correlationId,
        eventType: 'PackageDelivered',
        occurredAt: '2026-10-07T15:30:00.000Z',
        payload: JSON.stringify({
          packageId,
          routeId,
          stopId,
          attemptId,
        }),
      };

      const envelope = OutboxEventMapper.toEnvelope(row);
      expect(envelope.payload).toEqual({
        packageId,
        routeId,
        stopId,
        attemptId,
      });
    });
  });

  describe('Detección de anomalías y casos borde', () => {
    it('debe rechazar con EVENT_INVALID_JSON cuando el payload sea un string JSON corrupto', () => {
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        eventType: 'PackageDelivered',
        occurredAt: '2026-10-07T15:30:00.000Z',
        payload: '{ broken json ',
      };

      expect(() => OutboxEventMapper.toEnvelope(row)).toThrow(MessagingError);
      try {
        OutboxEventMapper.toEnvelope(row);
      } catch (err: unknown) {
        expect((err as MessagingError).code).toBe(
          MESSAGING_ERROR_CODES.EVENT_INVALID_JSON,
        );
      }
    });

    it('debe rechazar con EVENT_IDENTITY_MISMATCH cuando el tenantId del payload contradiga al registro', () => {
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        eventType: 'PackageDelivered',
        occurredAt: '2026-10-07T15:30:00.000Z',
        payload: {
          tenantId: '62295af8-37e3-4f62-ac8f-1047c7448922', // Contradice row.tenantId
          packageId,
          routeId,
          stopId,
          attemptId,
        },
      };

      expect(() => OutboxEventMapper.toEnvelope(row)).toThrow(MessagingError);
      try {
        OutboxEventMapper.toEnvelope(row);
      } catch (err: unknown) {
        expect((err as MessagingError).code).toBe(
          MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
        );
        expect((err as MessagingError).field).toBe('tenantId');
      }
    });

    it('debe rechazar con OUTBOX_LEGACY_EVENT_AMBIGUOUS si no puede determinarse el productor', () => {
      const row: RawOutboxEventRecord = {
        tenantId,
        eventId,
        eventType: 'CustomUnknownEvent',
        occurredAt: '2026-10-07T15:30:00.000Z',
        payload: { some: 'data' },
      };

      expect(() => OutboxEventMapper.toEnvelope(row)).toThrow(MessagingError);
      try {
        OutboxEventMapper.toEnvelope(row);
      } catch (err: unknown) {
        expect((err as MessagingError).code).toBe(
          MESSAGING_ERROR_CODES.OUTBOX_LEGACY_EVENT_AMBIGUOUS,
        );
      }
    });
  });
});
