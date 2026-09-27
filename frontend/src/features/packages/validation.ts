import { PACKAGE_PRIORITIES } from './types';
import type { RegisterPackageFormErrors, RegisterPackageFormValues } from './types';

export function validateRegisterPackageForm(
  form: RegisterPackageFormValues,
): RegisterPackageFormErrors {
  const errors: RegisterPackageFormErrors = {};

  if (!form.trackingCode.trim()) {
    errors.trackingCode = 'El número de guía es obligatorio.';
  }
  if (!form.zoneId) {
    errors.zoneId = 'Selecciona una zona.';
  }
  if (!form.shipmentTypeId) {
    errors.shipmentTypeId = 'Selecciona un tipo de envío.';
  }

  requirePositiveNumber(form.weightKg, 'El peso debe ser mayor a 0.', (msg) => (errors.weightKg = msg));
  requirePositiveNumber(form.lengthCm, 'El largo debe ser mayor a 0.', (msg) => (errors.lengthCm = msg));
  requirePositiveNumber(form.widthCm, 'El ancho debe ser mayor a 0.', (msg) => (errors.widthCm = msg));
  requirePositiveNumber(form.heightCm, 'El alto debe ser mayor a 0.', (msg) => (errors.heightCm = msg));

  if (!isPackagePriority(form.priority)) {
    errors.priority = 'Selecciona una prioridad válida.';
  }

  // Coordenadas: obligatorias en el schema actual (latitude/longitude no son nullable).
  if (!form.latitude.trim()) {
    errors.latitude = 'La latitud es obligatoria.';
  } else {
    const lat = Number(form.latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'La latitud debe estar entre -90 y 90.';
    }
  }
  if (!form.longitude.trim()) {
    errors.longitude = 'La longitud es obligatoria.';
  } else {
    const lng = Number(form.longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'La longitud debe estar entre -180 y 180.';
    }
  }

  return errors;
}

function requirePositiveNumber(value: string, message: string, setError: (msg: string) => void): void {
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n) || n <= 0) {
    setError(message);
  }
}

function isPackagePriority(value: string): value is (typeof PACKAGE_PRIORITIES)[number] {
  return (PACKAGE_PRIORITIES as readonly string[]).includes(value);
}
