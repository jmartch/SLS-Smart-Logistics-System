import { PACKAGE_PRIORITIES } from './types';
import type { RegisterPackageFormErrors, RegisterPackageFormValues } from './types';

const TRACKING_CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/i;
const MUNICIPALITY_CODE_PATTERN = /^[A-Z0-9]{2,10}$/i;
const ADDRESS_MAX_LENGTH = 300;

export function validateRegisterPackageForm(
  form: RegisterPackageFormValues,
): RegisterPackageFormErrors {
  const errors: RegisterPackageFormErrors = {};

  const trackingCode = form.trackingCode.trim();
  if (!trackingCode) {
    errors.trackingCode = 'El número de guía es obligatorio.';
  } else if (!TRACKING_CODE_PATTERN.test(trackingCode)) {
    errors.trackingCode = 'La guía debe tener entre 3 y 40 caracteres alfanuméricos, guiones o guiones bajos.';
  }

  const addressText = form.recipientAddress.trim();
  if (!addressText) {
    errors.recipientAddress = 'La dirección de entrega es obligatoria.';
  } else if (addressText.length > ADDRESS_MAX_LENGTH) {
    errors.recipientAddress = 'La dirección no puede superar 300 caracteres.';
  }

  const municipalityCode = form.municipalityCode.trim();
  if (!municipalityCode) {
    errors.municipalityCode = 'El código de municipio (DANE) es obligatorio.';
  } else if (!MUNICIPALITY_CODE_PATTERN.test(municipalityCode)) {
    errors.municipalityCode = 'El código de municipio debe tener entre 2 y 10 caracteres alfanuméricos.';
  }

  if (!form.shipmentTypeId.trim()) {
    errors.shipmentTypeId = 'Selecciona un tipo de envío.';
  }

  if (form.sectorId.trim() && !form.zoneId.trim()) {
    errors.sectorId = 'Selecciona una zona antes de elegir un sector.';
  }

  requirePositiveNumber(form.weightKg, 'El peso debe ser mayor a 0.', (msg) => (errors.weightKg = msg));
  requirePositiveNumber(form.lengthCm, 'El largo debe ser mayor a 0.', (msg) => (errors.lengthCm = msg));
  requirePositiveNumber(form.widthCm, 'El ancho debe ser mayor a 0.', (msg) => (errors.widthCm = msg));
  requirePositiveNumber(form.heightCm, 'El alto debe ser mayor a 0.', (msg) => (errors.heightCm = msg));

  if (!isPackagePriority(form.priority)) {
    errors.priority = 'Selecciona una prioridad válida.';
  }

  if (form.deadline.trim()) {
    const parsed = new Date(form.deadline);
    if (Number.isNaN(parsed.getTime())) {
      errors.deadline = 'Ingresa una fecha y hora límite válida.';
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
