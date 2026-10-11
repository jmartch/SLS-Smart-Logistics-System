import { Coordinates } from '../coordinates';
import { InvalidStopOrderingInputError } from '../models/invalid-stop-ordering-input.error';
import type {
  StopCandidateInput,
  StopOrderingOptions,
} from '../models/stop-ordering.types';

export function validateStopOrderingInput(
  candidates: readonly StopCandidateInput[],
  options: StopOrderingOptions,
): void {
  // 1. Validar opciones de tenantId
  if (
    !options ||
    typeof options.tenantId !== 'string' ||
    options.tenantId.trim() !== options.tenantId ||
    options.tenantId.length === 0
  ) {
    throw new InvalidStopOrderingInputError('INVALID_TENANT_ID');
  }

  // 2. Validar estructura de la colección de candidatos
  if (!Array.isArray(candidates)) {
    throw new InvalidStopOrderingInputError('INVALID_CANDIDATES');
  }
  for (const c of candidates) {
    if (!c || typeof c !== 'object') {
      throw new InvalidStopOrderingInputError('INVALID_CANDIDATES');
    }
  }

  // 3. Precedencia: Verificar aislamiento de tenant antes que IDs
  for (const c of candidates) {
    if (c.tenantId !== options.tenantId) {
      throw new InvalidStopOrderingInputError('TENANT_MISMATCH');
    }
  }

  // 4. Validar formato de packageId y unicidad
  const seenIds = new Set<string>();
  for (const c of candidates) {
    if (
      typeof c.packageId !== 'string' ||
      c.packageId.trim() !== c.packageId ||
      c.packageId.length === 0
    ) {
      throw new InvalidStopOrderingInputError('INVALID_PACKAGE_ID');
    }
    if (seenIds.has(c.packageId)) {
      throw new InvalidStopOrderingInputError('DUPLICATE_PACKAGE_ID');
    }
    seenIds.add(c.packageId);
  }

  // 5. Validar coordenadas de origen
  if (!options.origin || !(options.origin instanceof Coordinates)) {
    throw new InvalidStopOrderingInputError('INVALID_ORIGIN');
  }

  // 6. Validar coordenadas de paradas
  for (const c of candidates) {
    if (c.coordinates === undefined || c.coordinates === null) {
      throw new InvalidStopOrderingInputError('MISSING_STOP_COORDINATES');
    }
    if (
      !(c.coordinates instanceof Coordinates) ||
      typeof c.coordinates.latitude !== 'number' ||
      typeof c.coordinates.longitude !== 'number' ||
      !Number.isFinite(c.coordinates.latitude) ||
      !Number.isFinite(c.coordinates.longitude) ||
      c.coordinates.latitude < -90 ||
      c.coordinates.latitude > 90 ||
      c.coordinates.longitude < -180 ||
      c.coordinates.longitude > 180
    ) {
      throw new InvalidStopOrderingInputError('INVALID_STOP_COORDINATES');
    }
  }

  // 7. Validar opciones de 2-opt (si están presentes)
  if (options.twoOpt !== undefined) {
    const { maxIterations, minImprovementMeters } = options.twoOpt;

    if (
      typeof maxIterations !== 'number' ||
      !Number.isSafeInteger(maxIterations) ||
      maxIterations < 0 ||
      maxIterations > 1000
    ) {
      throw new InvalidStopOrderingInputError('INVALID_MAX_ITERATIONS');
    }

    if (
      typeof minImprovementMeters !== 'number' ||
      !Number.isFinite(minImprovementMeters) ||
      Number.isNaN(minImprovementMeters) ||
      minImprovementMeters < 0
    ) {
      throw new InvalidStopOrderingInputError('INVALID_MIN_IMPROVEMENT');
    }
  }
}