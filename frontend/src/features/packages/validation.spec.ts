import { describe, expect, it } from 'vitest';
import { EMPTY_REGISTER_PACKAGE_FORM } from './types';
import type { RegisterPackageFormValues } from './types';
import { validateRegisterPackageForm } from './validation';

const VALID_FORM: RegisterPackageFormValues = {
  ...EMPTY_REGISTER_PACKAGE_FORM,
  trackingCode: 'SLS-001',
  zoneId: 'zone-norte',
  shipmentTypeId: 'standard',
  weightKg: '2.5',
  lengthCm: '30',
  widthCm: '20',
  heightCm: '15',
  priority: 'NORMAL',
  latitude: '10.96854',
  longitude: '-74.78132',
};

describe('validateRegisterPackageForm', () => {
  it('accepts a complete form with finite values', () => {
    expect(validateRegisterPackageForm(VALID_FORM)).toEqual({});
  });

  it.each(['weightKg', 'lengthCm', 'widthCm', 'heightCm'] as const)(
    'rejects non-finite values for %s',
    (field) => {
      const errors = validateRegisterPackageForm({ ...VALID_FORM, [field]: '1e309' });

      expect(errors[field]).toBeDefined();
    },
  );

  it('rejects non-finite and out-of-range coordinates', () => {
    const errors = validateRegisterPackageForm({
      ...VALID_FORM,
      latitude: '1e309',
      longitude: '-181',
    });

    expect(errors.latitude).toBeDefined();
    expect(errors.longitude).toBeDefined();
  });
});
