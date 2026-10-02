import { UnauthorizedException } from '@nestjs/common';
import { extractTenantId } from '../presentation/current-tenant.decorator';

const VALID_TENANT_ID = '10000000-0000-4000-8000-000000000001';

describe('CurrentTenant decorator extractor', () => {
  it('extracts tenantId from authenticated user context', () => {
    const request = {
      user: { tenantId: VALID_TENANT_ID },
      headers: {},
    };

    const tenantId = extractTenantId(request);

    expect(tenantId).toBe(VALID_TENANT_ID);
  });

  it('extracts tenantId from x-tenant-id header when user context is absent', () => {
    const request = {
      headers: { 'x-tenant-id': VALID_TENANT_ID },
    };

    const tenantId = extractTenantId(request);

    expect(tenantId).toBe(VALID_TENANT_ID);
  });

  it('extracts tenantId from tenant-id header fallback', () => {
    const request = {
      headers: { 'tenant-id': VALID_TENANT_ID },
    };

    const tenantId = extractTenantId(request);

    expect(tenantId).toBe(VALID_TENANT_ID);
  });

  it('throws UnauthorizedException when no tenant is provided', () => {
    const request = {
      headers: {},
    };

    expect(() => extractTenantId(request)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when tenantId is not a valid UUID', () => {
    const request = {
      headers: { 'x-tenant-id': 'invalid-uuid-string' },
    };

    expect(() => extractTenantId(request)).toThrow(UnauthorizedException);
  });
});
