import { randomUUID } from 'node:crypto';
import {
  DeliveryForbiddenError,
  DeliveryValidationError,
  IdempotencyConflictError,
} from '../../domain/delivery-errors';
import type { DeliveryAccessPort } from '../ports/delivery-access.port';
import type { DeliveryUnitOfWork } from '../ports/delivery-unit-of-work';

export interface ReportIncidentCommand {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly type: string;
  readonly description: string;
  readonly routeId?: string | null;
  readonly routeStopId?: string | null;
  readonly packageId?: string | null;
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface ReportIncidentResult {
  readonly incidentId: string;
  readonly status: 'OPEN';
  readonly type: string;
  readonly replayed: boolean;
}

export class ReportIncidentUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
  ) {}

  async execute(command: ReportIncidentCommand): Promise<ReportIncidentResult> {
    const {
      tenantId,
      actorUserId,
      type,
      description,
      routeId,
      routeStopId,
      packageId,
      requestId,
    } = command;
    const correlationId = command.correlationId ?? randomUUID();

    // 1. Invariante: Al menos un objetivo debe ser provisto (D6)
    if (!routeId && !routeStopId && !packageId) {
      throw new DeliveryValidationError(
        'At least one target entity (routeId, routeStopId, or packageId) is required to report an incident',
        'target',
      );
    }

    if (!type || !type.trim()) {
      throw new DeliveryValidationError('Incident type is mandatory', 'type');
    }

    if (!description || !description.trim()) {
      throw new DeliveryValidationError(
        'Incident description is mandatory',
        'description',
      );
    }

    if (description.trim().length > 2000) {
      throw new DeliveryValidationError(
        'Incident description cannot exceed 2000 characters',
        'description',
      );
    }

    const canReport = await this.accessPort.canReportIncident(
      tenantId,
      actorUserId,
      routeId ?? undefined,
    );
    if (!canReport) {
      throw new DeliveryForbiddenError(
        'Actor is not authorized to report operational incidents',
      );
    }

    return this.unitOfWork.run(tenantId, async (session) => {
      // 2. Idempotencia
      const existingOp = await session.findOperation(requestId);
      if (existingOp) {
        if (existingOp.commandType !== 'REPORT_INCIDENT') {
          throw new IdempotencyConflictError(requestId);
        }
        return {
          ...(existingOp.resultSnapshot as unknown as ReportIncidentResult),
          replayed: true,
        };
      }

      // 3. Crear y registrar incidente con estado inicial OPEN
      const incidentId = randomUUID();
      const now = new Date();

      await session.saveIncident({
        id: incidentId,
        tenantId,
        routeId: routeId ?? null,
        routeStopId: routeStopId ?? null,
        packageId: packageId ?? null,
        reportedByUserId: actorUserId,
        type: type.trim(),
        description: description.trim(),
        status: 'OPEN',
        reportedAt: now,
      });

      // 4. Outbox, auditoría y recibo
      await session.recordOutbox({
        eventId: randomUUID(),
        tenantId,
        correlationId,
        eventType: 'IncidentReported',
        occurredAt: now,
        producer: 'sls-backend.deliveries',
        version: 1,
        payload: {
          incidentId,
          type: type.trim(),
          routeId,
          routeStopId,
          packageId,
        },
      });

      const result: ReportIncidentResult = {
        incidentId,
        status: 'OPEN',
        type: type.trim(),
        replayed: false,
      };

      await session.saveOperation({
        id: randomUUID(),
        tenantId,
        requestId,
        actorUserId,
        commandType: 'REPORT_INCIDENT',
        targetId: incidentId,
        requestHash: requestId,
        resultSnapshot: result as unknown as Record<string, unknown>,
        createdAt: now,
      });

      return result;
    });
  }
}
