import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import {
    InvalidPackageRegistrationError,
    type InvalidPackageRegistrationReason,
    type PackageRegistrationField,
} from '../domain/invalid-package-registration.error';
import { InvalidPackageTransitionError } from '../domain/invalid-package-transition.error';
import { PackageNotFoundError } from '../domain/package-errors';

const FIELD_LABELS: Record<PackageRegistrationField, string> = {
    trackingCode: 'El código de seguimiento',
    address: 'La dirección',
    municipalityCode: 'El código de municipio',
    shipmentTypeId: 'El tipo de envío (shipmentTypeId)',
    zoneId: 'La zona (zoneId)',
    sectorId: 'El sector (sectorId)',
    weightKg: 'El peso (kg)',
    lengthCm: 'El largo (cm)',
    widthCm: 'El ancho (cm)',
    heightCm: 'El alto (cm)',
    volumeM3: 'El volumen calculado (m³)',
    priority: 'La prioridad',
    deadline: 'La fecha límite',
    serviceDurationSeconds: 'La duración del servicio (segundos)',
};

const REASON_MESSAGES: Record<InvalidPackageRegistrationReason, string> = {
    REQUIRED: 'es obligatorio.',
    INVALID_FORMAT: 'tiene un formato inválido.',
    NOT_POSITIVE: 'debe ser mayor que cero.',
    TOO_MANY_DECIMALS: 'tiene más decimales de los permitidos.',
    OUT_OF_RANGE: 'excede el valor máximo permitido.',
    SECTOR_REQUIRES_ZONE: 'no puede indicarse sin una zona (zoneId).',
};

export function handlePackageDomainError(error: unknown): never {
    if (error instanceof PackageNotFoundError) {
        throw new NotFoundException({
            code: error.code,
            message: error.message,
        });
    }
    if (error instanceof InvalidPackageTransitionError) {
        throw new ConflictException({
            code: error.code,
            message: error.message,
        });
    }
    if (error instanceof InvalidPackageRegistrationError) {
        const detail = `${FIELD_LABELS[error.field]} ${REASON_MESSAGES[error.reason]}`;

        throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: detail,
            fields: { [error.field]: detail },
        });
    }

    throw error;
}

export function handlePackageFailure(code: string): never {
    switch (code) {
        case 'PACKAGE_TRACKING_CODE_CONFLICT':
            throw new ConflictException({
                code,
                message:
                    'Ya existe un paquete con ese código de seguimiento en esta empresa.',
                fields: { trackingCode: 'Utiliza otro código de seguimiento.' },
            });
        case 'PACKAGE_SHIPMENT_TYPE_NOT_FOUND':
            throw new NotFoundException({
                code,
                message: 'El tipo de envío no existe en esta empresa.',
                fields: {
                    shipmentTypeId: 'Indica un tipo de envío de esta empresa.',
                },
            });
        case 'PACKAGE_SHIPMENT_TYPE_INACTIVE':
            throw new ConflictException({
                code,
                message:
                    'El tipo de envío está inactivo y no admite paquetes nuevos.',
                fields: { shipmentTypeId: 'Usa un tipo de envío activo.' },
            });
        case 'PACKAGE_ZONE_NOT_FOUND':
            throw new NotFoundException({
                code,
                message: 'La zona no existe en esta empresa.',
                fields: { zoneId: 'Indica una zona de esta empresa.' },
            });
        case 'PACKAGE_SECTOR_NOT_FOUND':
            throw new NotFoundException({
                code,
                message: 'El sector no existe en esta empresa.',
                fields: { sectorId: 'Indica un sector de esta empresa.' },
            });
        case 'PACKAGE_SECTOR_ZONE_MISMATCH':
            throw new ConflictException({
                code,
                message: 'El sector no pertenece a la zona indicada.',
                fields: { sectorId: 'Usa un sector de la zona seleccionada.' },
            });
        default:
            throw new ConflictException({
                code,
                message: 'Conflicto en la operación.',
            });
    }
}
