import { UnauthorizedException } from '@nestjs/common';
import { extractTenantId } from '../../../shared/presentation/request-context.decorator';

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

  it('prioritizes verified ActorContext (request.actor) over spoofed headers', () => {
    const spoofedTenantId = '20000000-0000-4000-8000-000000000002';
    const request = {
      actor: {
        kind: 'TENANT_USER' as const,
        tenantId: VALID_TENANT_ID,
        userId: '30000000-0000-4000-8000-000000000003',
        permissions: new Set(['COORDINATE_ROUTES']),
      },
      headers: { 'x-tenant-id': spoofedTenantId },
    };

    const tenantId = extractTenantId(request);

    expect(tenantId).toBe(VALID_TENANT_ID);
  });

  it('rejects PLATFORM_ADMIN actor on tenant-scoped context extraction', () => {
    const request = {
      actor: {
        kind: 'PLATFORM_ADMIN' as const,
        platformAdminId: '40000000-0000-4000-8000-000000000004',
      },
      headers: { 'x-tenant-id': VALID_TENANT_ID },
    };

    expect(() => extractTenantId(request)).toThrow(
      'This operation requires a tenant-user actor, not a platform admin',
    );
  });
});
