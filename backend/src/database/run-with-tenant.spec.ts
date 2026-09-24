import { isValidTenantId } from './run-with-tenant';

describe('isValidTenantId', () => {
  it('accepts a well-formed UUID', () => {
    expect(isValidTenantId('123e4567-e89b-12d3-a456-426614174000')).toBe(
      true,
    );
  });

  it('rejects a value that is not a UUID', () => {
    expect(isValidTenantId("'; DROP TABLE \"Package\"; --")).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidTenantId('')).toBe(false);
  });
});
