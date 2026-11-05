import { Coordinates } from '../../domain/coordinates';
import { EARTH_RADIUS_METERS } from '../../domain/haversine';
import type {
    StopCandidateInput,
    StopOrderingOptions,
} from '../../domain/models/stop-ordering.types';

export const DEFAULT_TENANT_ID = 'tenant-a';
export const ALT_TENANT_ID = 'tenant-b';

export const FIXED_ORIGIN = Object.freeze(Coordinates.create(0, 0));

/**
 * Constante oráculo: metros por grado en el ecuador (R * π / 180).
 * Aproximadamente 111_194.92664455873 m.
 */
export const METERS_PER_DEGREE_EQUATOR = (EARTH_RADIUS_METERS * Math.PI) / 180;

export function deepFreeze<T>(obj: T): Readonly<T> {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
        const value = (obj as any)[key];
        if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
            deepFreeze(value);
        }
    }
    return obj;
}

export function createStopCandidate(
    packageId: string,
    latitude: number,
    longitude: number,
    tenantId: string = DEFAULT_TENANT_ID,
): StopCandidateInput {
    return Object.freeze({
        packageId,
        tenantId,
        coordinates: Coordinates.create(latitude, longitude),
    });
}

export function createStopOrderingOptions(
    overrides?: Partial<StopOrderingOptions>,
): StopOrderingOptions {
    return Object.freeze({
        tenantId: DEFAULT_TENANT_ID,
        origin: FIXED_ORIGIN,
        ...overrides,
    });
}

// 1. Vacío
export const EMPTY_CANDIDATES: readonly StopCandidateInput[] = deepFreeze([]);

// 2. Un paquete: O -> A -> O
export const SINGLE_CANDIDATE: readonly StopCandidateInput[] = deepFreeze([
    createStopCandidate('pkg-1', 0, 0.01),
]);

// 3. Dos paquetes colineales: O -> A -> B
export const TWO_CANDIDATES: readonly StopCandidateInput[] = deepFreeze([
    createStopCandidate('pkg-1', 0, 0.01),
    createStopCandidate('pkg-2', 0, 0.02),
]);

// 4. Tres colineales: O -> A -> B -> C
export const COLLINEAR_CANDIDATES: readonly StopCandidateInput[] = deepFreeze([
    createStopCandidate('pkg-1', 0, 0.01),
    createStopCandidate('pkg-2', 0, 0.02),
    createStopCandidate('pkg-3', 0, 0.03),
]);

// 5. Triángulo con depósito (equidistantes de O, empate por distancia)
export const TRIANGLE_CANDIDATES: readonly StopCandidateInput[] = deepFreeze([
    createStopCandidate('pkg-a', 0, 0.01),
    createStopCandidate('pkg-b', 0.01, 0),
]);

// 6. Coincidentes en coordenadas
export const COINCIDENT_CANDIDATES: readonly StopCandidateInput[] = deepFreeze([
    createStopCandidate('pkg-1', 0, 0),
    createStopCandidate('pkg-2', 0, 0),
    createStopCandidate('pkg-3', 0, 0.01),
]);

// 7. Empate ordinal estricto ('pkg-10' < 'pkg-2' en UTF-16)
export const ORDINAL_TIE_CANDIDATES: readonly StopCandidateInput[] = deepFreeze([
    createStopCandidate('pkg-2', 0, 0.01),
    createStopCandidate('pkg-10', 0, 0.01),
]);

// 8. Circuito con cruce (para verificar que 2-opt mejora eliminando cruce)
// A=(0, 0.01), B=(0.01, 0.01), C=(0.02, 0), D=(0.022, 0.02)
export const CROSSING_CIRCUIT_CANDIDATES: readonly StopCandidateInput[] = deepFreeze([
    createStopCandidate('pkg-a', 0, 0.01),
    createStopCandidate('pkg-b', 0.01, 0.01),
    createStopCandidate('pkg-c', 0.02, 0),
    createStopCandidate('pkg-d', 0.022, 0.02),
]);