import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PlanAndAssignRoutesCommand } from '../../application/ports/plan-and-assign-routes.contract';

export interface PlanAndAssignRoutesBodyDto {
  readonly requestId?: string;
  readonly zoneId: string;
  readonly packageIds: readonly string[];
  readonly resourceSelection?: 'AUTOMATIC' | 'MANUAL';
  readonly vehicleIds?: readonly string[];
  readonly courierIds?: readonly string[];
  readonly depotId: string;
  readonly datasetId?: string;
  readonly profile?: 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';
  readonly window: {
    readonly startAt: string;
    readonly endAt: string;
  };
  readonly radiusMeters?: number;
  readonly ordering?: 'nearest-neighbor' | 'nearest-neighbor-two-opt';
  readonly twoOpt?: {
    readonly maxIterations: number;
    readonly minImprovementMeters: number;
  };
}

export function validateAndBuildCommand(
  body: unknown,
  fallbackRequestId?: string,
): PlanAndAssignRoutesCommand {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'El cuerpo de la petición debe ser un objeto JSON válido.',
    });
  }

  const dto = body as Partial<PlanAndAssignRoutesBodyDto>;
  const errors: Record<string, string> = {};

  const requestId = dto.requestId?.trim() || fallbackRequestId || randomUUID();

  if (
    !dto.zoneId ||
    typeof dto.zoneId !== 'string' ||
    dto.zoneId.trim() === ''
  ) {
    errors.zoneId = 'zoneId es obligatorio y debe ser un identificador válido.';
  }

  if (
    !dto.depotId ||
    typeof dto.depotId !== 'string' ||
    dto.depotId.trim() === ''
  ) {
    errors.depotId =
      'depotId es obligatorio y debe ser un identificador válido.';
  }

  if (!Array.isArray(dto.packageIds) || dto.packageIds.length === 0) {
    errors.packageIds =
      'packageIds debe ser un arreglo no vacío con al menos un paquete.';
  } else if (
    !dto.packageIds.every((id) => typeof id === 'string' && id.trim() !== '')
  ) {
    errors.packageIds =
      'Todos los elementos de packageIds deben ser identificadores válidos.';
  }

  const resourceSelection =
    dto.resourceSelection ??
    (dto.vehicleIds === undefined && dto.courierIds === undefined
      ? 'AUTOMATIC'
      : 'MANUAL');
  if (resourceSelection !== 'AUTOMATIC' && resourceSelection !== 'MANUAL') {
    errors.resourceSelection = 'resourceSelection debe ser AUTOMATIC o MANUAL.';
  }

  const vehicleIds = Array.isArray(dto.vehicleIds) ? dto.vehicleIds : [];
  const courierIds = Array.isArray(dto.courierIds) ? dto.courierIds : [];

  if (!dto.window || typeof dto.window !== 'object') {
    errors.window = 'window es obligatorio y debe contener startAt y endAt.';
  } else {
    const start = new Date(dto.window.startAt).getTime();
    const end = new Date(dto.window.endAt).getTime();

    if (Number.isNaN(start)) {
      errors['window.startAt'] =
        'window.startAt debe ser una fecha ISO válida.';
    }
    if (Number.isNaN(end)) {
      errors['window.endAt'] = 'window.endAt debe ser una fecha ISO válida.';
    }
    if (!Number.isNaN(start) && !Number.isNaN(end) && start >= end) {
      errors.window =
        'window.startAt debe ser cronológicamente anterior a window.endAt.';
    }
  }

  const validProfiles = [
    'MOTOR_VEHICLE',
    'MOTORCYCLE',
    'BICYCLE',
    'FOOT',
  ] as const;
  const profile = dto.profile ?? 'MOTOR_VEHICLE';
  if (!validProfiles.includes(profile as any)) {
    errors.profile = `profile debe ser uno de: ${validProfiles.join(', ')}.`;
  }

  const validOrderings = [
    'nearest-neighbor',
    'nearest-neighbor-two-opt',
  ] as const;
  const ordering = dto.ordering ?? 'nearest-neighbor';
  if (!validOrderings.includes(ordering as any)) {
    errors.ordering = `ordering debe ser uno de: ${validOrderings.join(', ')}.`;
  }

  const radiusMeters = dto.radiusMeters ?? 2000;
  if (typeof radiusMeters !== 'number' || radiusMeters <= 0) {
    errors.radiusMeters = 'radiusMeters debe ser un número mayor a cero.';
  }

  let twoOpt:
    { maxIterations: number; minImprovementMeters: number } | undefined;
  if (dto.twoOpt) {
    if (
      typeof dto.twoOpt.maxIterations !== 'number' ||
      dto.twoOpt.maxIterations <= 0 ||
      typeof dto.twoOpt.minImprovementMeters !== 'number' ||
      dto.twoOpt.minImprovementMeters < 0
    ) {
      errors.twoOpt =
        'twoOpt debe contener maxIterations > 0 y minImprovementMeters >= 0.';
    } else {
      twoOpt = {
        maxIterations: dto.twoOpt.maxIterations,
        minImprovementMeters: dto.twoOpt.minImprovementMeters,
      };
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Los parámetros de planificación no son válidos.',
      fields: errors,
    });
  }

  return {
    requestId,
    zoneId: dto.zoneId!.trim(),
    packageIds: dto.packageIds!,
    resourceSelection,
    vehicleIds: resourceSelection === 'AUTOMATIC' ? [] : vehicleIds,
    courierIds: resourceSelection === 'AUTOMATIC' ? [] : courierIds,
    depotId: dto.depotId!.trim(),
    datasetId: dto.datasetId?.trim() || 'BAQ-ROAD-2026',
    profile,
    window: {
      startAt: new Date(dto.window!.startAt).toISOString(),
      endAt: new Date(dto.window!.endAt).toISOString(),
    },
    radiusMeters,
    ordering,
    twoOpt,
  };
}
