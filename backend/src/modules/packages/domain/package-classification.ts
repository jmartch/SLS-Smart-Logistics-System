import {
    InvalidPackageRegistrationError,
    type PackageRegistrationField,
} from './invalid-package-registration.error';

export interface PackageClassificationData {
    readonly zoneId: string;
    readonly sectorId: string | null;
}

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseReferenceId(
    value: unknown,
    field: PackageRegistrationField,
    required: boolean,
): string | null {
    if (value === undefined || value === null || value === '') {
        if (required) {
            throw new InvalidPackageRegistrationError(field, 'REQUIRED');
        }
        return null;
    }
    if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
        throw new InvalidPackageRegistrationError(field, 'INVALID_FORMAT');
    }
    return value.trim().toLowerCase();
}

export function isPackageUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

/**
 * Valida y normaliza una solicitud de clasificación de paquete.
 * Requiere zoneId (UUID) y permite sectorId opcional (UUID).
 */
export function parsePackageClassification(
    input: unknown,
): PackageClassificationData {
    const body = isRecord(input) ? input : {};

    const zoneId = parseReferenceId(body.zoneId, 'zoneId', true) as string;
    const sectorId = parseReferenceId(body.sectorId, 'sectorId', false);

    return {
        zoneId,
        sectorId,
    };
}
