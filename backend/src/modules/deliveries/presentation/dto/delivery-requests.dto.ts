import { DeliveryValidationError } from '../../domain/delivery-errors';
import { validateUuid } from './delivery-common.dto';

export interface SuccessfulDeliveryBody {
  readonly notes?: string;
}

export function validateSuccessfulDeliveryBody(
  body: unknown,
): SuccessfulDeliveryBody {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const raw = body as Record<string, unknown>;
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : undefined;
  return { notes };
}

export interface FailedDeliveryBody {
  readonly reasonCode: string;
  readonly notes?: string;
}

export function validateFailedDeliveryBody(body: unknown): FailedDeliveryBody {
  if (!body || typeof body !== 'object') {
    throw new DeliveryValidationError('Request body is mandatory', 'body');
  }
  const raw = body as Record<string, unknown>;
  if (
    !raw.reasonCode ||
    typeof raw.reasonCode !== 'string' ||
    !raw.reasonCode.trim()
  ) {
    throw new DeliveryValidationError(
      'Property "reasonCode" is mandatory',
      'reasonCode',
    );
  }
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : undefined;
  return {
    reasonCode: raw.reasonCode.trim(),
    notes,
  };
}

export interface RescheduleDeliveryBody {
  readonly failedAttemptId: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reasonCode: string;
}

export function validateRescheduleDeliveryBody(
  body: unknown,
): RescheduleDeliveryBody {
  if (!body || typeof body !== 'object') {
    throw new DeliveryValidationError('Request body is mandatory', 'body');
  }
  const raw = body as Record<string, unknown>;
  const failedAttemptId = validateUuid(raw.failedAttemptId, 'failedAttemptId');

  if (!raw.startAt || typeof raw.startAt !== 'string') {
    throw new DeliveryValidationError(
      'Property "startAt" must be a valid date string',
      'startAt',
    );
  }
  if (!raw.endAt || typeof raw.endAt !== 'string') {
    throw new DeliveryValidationError(
      'Property "endAt" must be a valid date string',
      'endAt',
    );
  }

  const startAt = new Date(raw.startAt);
  const endAt = new Date(raw.endAt);

  if (isNaN(startAt.getTime())) {
    throw new DeliveryValidationError(
      'Property "startAt" is not a valid date',
      'startAt',
    );
  }
  if (isNaN(endAt.getTime())) {
    throw new DeliveryValidationError(
      'Property "endAt" is not a valid date',
      'endAt',
    );
  }

  if (
    !raw.reasonCode ||
    typeof raw.reasonCode !== 'string' ||
    !raw.reasonCode.trim()
  ) {
    throw new DeliveryValidationError(
      'Property "reasonCode" is mandatory',
      'reasonCode',
    );
  }

  return {
    failedAttemptId,
    startAt,
    endAt,
    reasonCode: raw.reasonCode.trim(),
  };
}

export interface RequestPackageReturnBody {
  readonly failedAttemptId: string;
  readonly reasonCode: string;
}

export function validateRequestPackageReturnBody(
  body: unknown,
): RequestPackageReturnBody {
  if (!body || typeof body !== 'object') {
    throw new DeliveryValidationError('Request body is mandatory', 'body');
  }
  const raw = body as Record<string, unknown>;
  const failedAttemptId = validateUuid(raw.failedAttemptId, 'failedAttemptId');

  if (
    !raw.reasonCode ||
    typeof raw.reasonCode !== 'string' ||
    !raw.reasonCode.trim()
  ) {
    throw new DeliveryValidationError(
      'Property "reasonCode" is mandatory',
      'reasonCode',
    );
  }

  return {
    failedAttemptId,
    reasonCode: raw.reasonCode.trim(),
  };
}

export interface ReturnPackageToDepotBody {
  readonly routeId: string;
  readonly depotId: string;
  readonly physicalReceiptConfirmed: boolean;
}

export function validateReturnPackageToDepotBody(
  body: unknown,
): ReturnPackageToDepotBody {
  if (!body || typeof body !== 'object') {
    throw new DeliveryValidationError('Request body is mandatory', 'body');
  }
  const raw = body as Record<string, unknown>;
  const routeId = validateUuid(raw.routeId, 'routeId');

  if (!raw.depotId || typeof raw.depotId !== 'string' || !raw.depotId.trim()) {
    throw new DeliveryValidationError(
      'Property "depotId" is mandatory',
      'depotId',
    );
  }
  if (raw.physicalReceiptConfirmed !== true) {
    throw new DeliveryValidationError(
      'Property "physicalReceiptConfirmed" must be true to complete depot return',
      'physicalReceiptConfirmed',
    );
  }

  return {
    routeId,
    depotId: raw.depotId.trim(),
    physicalReceiptConfirmed: true,
  };
}

export interface ReportIncidentBody {
  readonly routeId?: string;
  readonly routeStopId?: string;
  readonly packageId?: string;
  readonly type: string;
  readonly description: string;
}

export function validateReportIncidentBody(body: unknown): ReportIncidentBody {
  if (!body || typeof body !== 'object') {
    throw new DeliveryValidationError('Request body is mandatory', 'body');
  }
  const raw = body as Record<string, unknown>;

  const routeId = raw.routeId
    ? validateUuid(raw.routeId, 'routeId')
    : undefined;
  const routeStopId = raw.routeStopId
    ? validateUuid(raw.routeStopId, 'routeStopId')
    : undefined;
  const packageId = raw.packageId
    ? validateUuid(raw.packageId, 'packageId')
    : undefined;

  if (!routeId && !routeStopId && !packageId) {
    throw new DeliveryValidationError(
      'At least one target entity (routeId, routeStopId, or packageId) is required to report an incident',
      'target',
    );
  }

  if (!raw.type || typeof raw.type !== 'string' || !raw.type.trim()) {
    throw new DeliveryValidationError('Property "type" is mandatory', 'type');
  }
  if (
    !raw.description ||
    typeof raw.description !== 'string' ||
    !raw.description.trim()
  ) {
    throw new DeliveryValidationError(
      'Property "description" is mandatory',
      'description',
    );
  }

  return {
    routeId,
    routeStopId,
    packageId,
    type: raw.type.trim(),
    description: raw.description.trim(),
  };
}
