import { UnauthorizedException } from '@nestjs/common';
import { extractTenantId } from '../../../shared/presentation/request-context.decorator';

const VALID_TENANT_ID = '10000000-0000-4000-8000-000000000001';

describe('CurrentTenant decorator extractor', () => {
  it('extracts tenantId from verified ActorContext (request.actor)', () => {
    const request = {
      actor: {
        kind: 'TENANT_USER' as const,
        tenantId: VALID_TENANT_ID,
        userId: '30000000-0000-4000-8000-000000000003',
        permissions: new Set(['COORDINATE_ROUTES']),
      },
      headers: {},
    };

    const tenantId = extractTenantId(request);

    expect(tenantId).toBe(VALID_TENANT_ID);
  });

  it('rejects with UnauthorizedException when request.actor is absent even if x-tenant-id header is provided', () => {
    const request = {
      headers: { 'x-tenant-id': VALID_TENANT_ID },
    };

    expect(() => extractTenantId(request)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when no actor is provided', () => {
    const request = {
      headers: {},
    };

    expect(() => extractTenantId(request)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when actor tenantId is not a valid UUID', () => {
    const request = {
      actor: {
        kind: 'TENANT_USER' as const,
        tenantId: 'invalid-uuid-string',
        userId: '30000000-0000-4000-8000-000000000003',
        permissions: new Set(['COORDINATE_ROUTES']),
      },
      headers: {},
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
