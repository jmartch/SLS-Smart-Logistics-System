import { RouteValidationError } from '../../domain/route-errors';
import { RouteClosureMode } from '../../domain/route-closure.types';
import { DepotReceiptInput } from '../../application/ports/route-close-contracts';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CloseRouteBody {
  readonly mode: RouteClosureMode;
  readonly reasonCode?: string;
  readonly notes?: string;
  readonly actualDistanceM?: number;
  readonly depotReceipt?: DepotReceiptInput;
}

export function validateIdempotencyKey(
  headers: Record<string, string | undefined>,
): string {
  const key = headers['idempotency-key'] ?? headers['x-idempotency-key'];
  if (!key || typeof key !== 'string' || !UUID_REGEX.test(key.trim())) {
    throw new RouteValidationError(
      'Idempotency-Key header is mandatory and must be a valid UUID',
    );
  }
  return key.trim();
}

export function validateCloseRouteBody(body: unknown): CloseRouteBody {
  if (!body || typeof body !== 'object') {
    throw new RouteValidationError('Request body must be an object');
  }

  const raw = body as Record<string, unknown>;

  if (
    raw.mode !== RouteClosureMode.REGULAR &&
    raw.mode !== RouteClosureMode.FORCED
  ) {
    throw new RouteValidationError(
      '"mode" property must be either "REGULAR" or "FORCED"',
    );
  }

  const mode = raw.mode as RouteClosureMode;

  let reasonCode: string | undefined;
  if (raw.reasonCode !== undefined && raw.reasonCode !== null) {
    if (typeof raw.reasonCode !== 'string' || !raw.reasonCode.trim()) {
      throw new RouteValidationError('"reasonCode" must be a non-empty string');
    }
    reasonCode = raw.reasonCode.trim();
  }

  let notes: string | undefined;
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== 'string') {
      throw new RouteValidationError('"notes" must be a string');
    }
    const trimmed = raw.notes.trim();
    if (trimmed.length < 1 || trimmed.length > 1000) {
      throw new RouteValidationError(
        '"notes" length must be between 1 and 1000 characters',
      );
    }
    notes = trimmed;
  }

  if (mode === RouteClosureMode.FORCED) {
    if (!reasonCode) {
      throw new RouteValidationError(
        '"reasonCode" is required when closing a route in FORCED mode',
      );
    }
    if (!notes) {
      throw new RouteValidationError(
        '"notes" is required when closing a route in FORCED mode',
      );
    }
  }

  let actualDistanceM: number | undefined;
  if (raw.actualDistanceM !== undefined && raw.actualDistanceM !== null) {
    if (
      typeof raw.actualDistanceM !== 'number' ||
      !Number.isFinite(raw.actualDistanceM) ||
      raw.actualDistanceM < 0
    ) {
      throw new RouteValidationError(
        '"actualDistanceM" must be a finite non-negative number',
      );
    }
    actualDistanceM = raw.actualDistanceM;
  }

  let depotReceipt: DepotReceiptInput | undefined;
  if (raw.depotReceipt !== undefined && raw.depotReceipt !== null) {
    if (typeof raw.depotReceipt !== 'object') {
      throw new RouteValidationError('"depotReceipt" must be an object');
    }
    const dr = raw.depotReceipt as Record<string, unknown>;
    if (typeof dr.depotId !== 'string' || !UUID_REGEX.test(dr.depotId)) {
      throw new RouteValidationError(
        '"depotReceipt.depotId" must be a valid UUID',
      );
    }
    if (typeof dr.physicalReceiptConfirmed !== 'boolean') {
      throw new RouteValidationError(
        '"depotReceipt.physicalReceiptConfirmed" must be a boolean',
      );
    }
    if (!Array.isArray(dr.assignmentIds)) {
      throw new RouteValidationError(
        '"depotReceipt.assignmentIds" must be an array of UUIDs',
      );
    }
    for (const aId of dr.assignmentIds) {
      if (typeof aId !== 'string' || !UUID_REGEX.test(aId)) {
        throw new RouteValidationError(
          `"depotReceipt.assignmentIds" contains invalid UUID: "${String(aId)}"`,
        );
      }
    }

    depotReceipt = {
      depotId: dr.depotId,
      physicalReceiptConfirmed: dr.physicalReceiptConfirmed,
      assignmentIds: dr.assignmentIds,
    };
  }

  return {
    mode,
    reasonCode,
    notes,
    actualDistanceM,
    depotReceipt,
  };
}
