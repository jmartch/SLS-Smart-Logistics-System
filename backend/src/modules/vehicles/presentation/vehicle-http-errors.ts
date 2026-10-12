import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  InvalidVehicleError,
  type InvalidVehicleReason,
  type VehicleField,
} from '../domain/invalid-vehicle.error';

const FIELD_LABELS: Record<VehicleField, string> = {
  plate: 'La placa',
  maxWeightKg: 'La capacidad máxima de peso (kg)',
  maxVolumeM3: 'La capacidad máxima de volumen (m³)',
};

const REASON_MESSAGES: Record<InvalidVehicleReason, string> = {
  REQUIRED: 'es obligatoria.',
  INVALID_FORMAT: 'tiene un formato inválido.',
  NOT_POSITIVE: 'debe ser mayor que cero.',
  TOO_MANY_DECIMALS: 'tiene más decimales de los permitidos.',
  OUT_OF_RANGE: 'excede el valor máximo permitido.',
};

export function handleVehicleDomainError(error: unknown): never {
  if (error instanceof InvalidVehicleError) {
    const detail = `${FIELD_LABELS[error.field]} ${REASON_MESSAGES[error.reason]}`;

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: detail,
      fields: { [error.field]: detail },
    });
  }

  throw error;
}

export function handleVehicleConflict(code: string): never {
  if (code === 'VEHICLE_PLATE_CONFLICT') {
    throw new ConflictException({
      code: 'VEHICLE_PLATE_CONFLICT',
      message: 'Ya existe un vehículo con esa placa en esta empresa.',
      fields: { plate: 'Utiliza otra placa.' },
    });
  }

  throw new ConflictException({ code, message: 'Conflicto en la operación.' });
}
