import { describe, expect, it } from 'vitest';
import { EMPTY_REGISTER_PACKAGE_FORM } from './types';
import type { RegisterPackageFormValues } from './types';
import { validateRegisterPackageForm } from './validation';

const VALID_FORM: RegisterPackageFormValues = {
  ...EMPTY_REGISTER_PACKAGE_FORM,
  trackingCode: 'SLS-2026-001',
  recipient: 'Droguería La Economía Norte',
  recipientAddress: 'Cra 53 # 82-45, Riomar, Barranquilla',
  municipalityCode: '08001',
  shipmentTypeId: 'b268c5c7-b2b5-411d-b734-07746ae7e6e6',
  zoneId: '08d92a06-4921-4989-92ff-f1917240779c',
  sectorId: '2ef99933-082e-4d24-b1a1-b5c574ca6aa5',
  weightKg: '2.5',
  lengthCm: '30',
  widthCm: '20',
  heightCm: '15',
  priority: 'NORMAL',
};

describe('validateRegisterPackageForm', () => {
  it('accepts a complete form with finite values and optional zone/sector', () => {
    expect(validateRegisterPackageForm(VALID_FORM)).toEqual({});
    expect(
      validateRegisterPackageForm({
        ...VALID_FORM,
        zoneId: '',
        sectorId: '',
      }),
    ).toEqual({});
  });

  it.each(['weightKg', 'lengthCm', 'widthCm', 'heightCm'] as const)(
    'rejects non-finite values for %s',
    (field) => {
      const errors = validateRegisterPackageForm({ ...VALID_FORM, [field]: '1e309' });

      expect(errors[field]).toBeDefined();
    },
  );

  it('rejects missing address, municipalityCode, or shipmentTypeId', () => {
    const errors = validateRegisterPackageForm({
      ...VALID_FORM,
      recipientAddress: '   ',
      municipalityCode: '',
      shipmentTypeId: '',
    });

    expect(errors.recipientAddress).toBeDefined();
    expect(errors.municipalityCode).toBeDefined();
    expect(errors.shipmentTypeId).toBeDefined();
  });

  it('rejects sectorId when zoneId is empty', () => {
    const errors = validateRegisterPackageForm({
      ...VALID_FORM,
      zoneId: '',
      sectorId: '2ef99933-082e-4d24-b1a1-b5c574ca6aa5',
    });

    expect(errors.sectorId).toBeDefined();
  });
});
