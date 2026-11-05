import { PackageStatus } from './package-state.types';
import {
    InvalidPackageRegistrationError,
    type PackageRegistrationField,
} from './invalid-package-registration.error';
import {
    HEIGHT_RULE,
    LENGTH_RULE,
    WEIGHT_RULE,
    WIDTH_RULE,
    computeVolumeM3,
    normalizePositiveDecimal,
} from './package-measures';

export const PACKAGE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type PackagePriorityName = (typeof PACKAGE_PRIORITIES)[number];

export interface PackageRegistrationData {
    readonly trackingCode: string;
    readonly addressText: string;
    readonly municipalityCode: string;
    readonly shipmentTypeId: string;
    readonly zoneId: string | null;
    readonly sectorId: string | null;
    readonly weightKg: string;
    readonly lengthCm: string;
    readonly widthCm: string;
    readonly heightCm: string;
    readonly volumeM3: string;
    readonly priority: PackagePriorityName;
    readonly deadline: Date | null;
    readonly serviceDurationSeconds: number | null;
    readonly initialState: typeof PackageStatus.REGISTERED;
}

const TRACKING_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;
const MUNICIPALITY_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_MAX_LENGTH = 300;
const SERVICE_DURATION_MAX_SECONDS = 86_400;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: PackageRegistrationField): string {
    if (value === undefined || value === null) {
        throw new InvalidPackageRegistrationError(field, 'REQUIRED');
    }
    if (typeof value !== 'string') {
        throw new InvalidPackageRegistrationError(field, 'INVALID_FORMAT');
    }
    const text = value.trim();
    if (text.length === 0) {
        throw new InvalidPackageRegistrationError(field, 'REQUIRED');
    }
    return text;
}

function referenceId(
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

function parsePriority(value: unknown): PackagePriorityName {
    if (value === undefined || value === null) {
        return 'NORMAL';
    }
    if (typeof value !== 'string') {
        throw new InvalidPackageRegistrationError('priority', 'INVALID_FORMAT');
    }
    const priority = value.trim().toUpperCase();
    if (!(PACKAGE_PRIORITIES as readonly string[]).includes(priority)) {
        throw new InvalidPackageRegistrationError('priority', 'INVALID_FORMAT');
    }
    return priority as PackagePriorityName;
}

function parseDeadline(value: unknown): Date | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    if (typeof value !== 'string') {
        throw new InvalidPackageRegistrationError('deadline', 'INVALID_FORMAT');
    }
    const text = value.trim();
    // ISO 8601 con fecha y hora completas (se acepta Z u offset).
    if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
            text,
        )
    ) {
        throw new InvalidPackageRegistrationError('deadline', 'INVALID_FORMAT');
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        throw new InvalidPackageRegistrationError('deadline', 'INVALID_FORMAT');
    }
    return date;
}

function parseServiceDuration(value: unknown): number | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new InvalidPackageRegistrationError(
            'serviceDurationSeconds',
            'INVALID_FORMAT',
        );
    }
    if (value <= 0) {
        throw new InvalidPackageRegistrationError(
            'serviceDurationSeconds',
            'NOT_POSITIVE',
        );
    }
    if (value > SERVICE_DURATION_MAX_SECONDS) {
        throw new InvalidPackageRegistrationError(
            'serviceDurationSeconds',
            'OUT_OF_RANGE',
        );
    }
    return value;
}

/**
 * Valida y normaliza una solicitud de registro. Lanza
 * InvalidPackageRegistrationError en el primer campo inválido.
 */
export function parsePackageRegistration(
    input: unknown,
): PackageRegistrationData {
    const body = isRecord(input) ? input : {};

    const trackingCode = requiredText(
        body.trackingCode,
        'trackingCode',
    ).toUpperCase();
    if (!TRACKING_CODE_PATTERN.test(trackingCode)) {
        throw new InvalidPackageRegistrationError(
            'trackingCode',
            'INVALID_FORMAT',
        );
    }

    if (body.address === undefined || body.address === null) {
        throw new InvalidPackageRegistrationError('address', 'REQUIRED');
    }
    if (!isRecord(body.address)) {
        throw new InvalidPackageRegistrationError('address', 'INVALID_FORMAT');
    }

    const addressText = requiredText(body.address.text, 'address');
    if (addressText.length > ADDRESS_MAX_LENGTH) {
        throw new InvalidPackageRegistrationError('address', 'OUT_OF_RANGE');
    }

    const municipalityCode = requiredText(
        body.address.municipalityCode,
        'municipalityCode',
    ).toUpperCase();
    if (!MUNICIPALITY_CODE_PATTERN.test(municipalityCode)) {
        throw new InvalidPackageRegistrationError(
            'municipalityCode',
            'INVALID_FORMAT',
        );
    }

    const shipmentTypeId = referenceId(
        body.shipmentTypeId,
        'shipmentTypeId',
        true,
    ) as string;
    const zoneId = referenceId(body.zoneId, 'zoneId', false);
    const sectorId = referenceId(body.sectorId, 'sectorId', false);

    if (sectorId !== null && zoneId === null) {
        throw new InvalidPackageRegistrationError(
            'sectorId',
            'SECTOR_REQUIRES_ZONE',
        );
    }

    const weightKg = normalizePositiveDecimal(body.weightKg, WEIGHT_RULE);
    const lengthCm = normalizePositiveDecimal(body.lengthCm, LENGTH_RULE);
    const widthCm = normalizePositiveDecimal(body.widthCm, WIDTH_RULE);
    const heightCm = normalizePositiveDecimal(body.heightCm, HEIGHT_RULE);
    const volumeM3 = computeVolumeM3(lengthCm, widthCm, heightCm);

    return {
        trackingCode,
        addressText,
        municipalityCode,
        shipmentTypeId,
        zoneId,
        sectorId,
        weightKg,
        lengthCm,
        widthCm,
        heightCm,
        volumeM3,
        priority: parsePriority(body.priority),
        deadline: parseDeadline(body.deadline),
        serviceDurationSeconds: parseServiceDuration(
            body.serviceDurationSeconds,
        ),
        initialState: PackageStatus.REGISTERED,
    };
}
