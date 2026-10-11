import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';
import type { ActorContext } from '../../../shared/application/actor-context';

function contextWith(actor: ActorContext | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('lets a platform admin through', () => {
    expect(
      guard.canActivate(
        contextWith({ kind: 'PLATFORM_ADMIN', platformAdminId: 'p-1' }),
      ),
    ).toBe(true);
  });

  it('rejects a tenant user with 403 PERMISSION_DENIED', () => {
    const tenantUser: ActorContext = {
      kind: 'TENANT_USER',
      tenantId: 't-1',
      userId: 'u-1',
      permissions: new Set(['MANAGE_TENANT']),
    };

    try {
      guard.canActivate(contextWith(tenantUser));
      throw new Error('expected the guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        error: {
          code: 'PERMISSION_DENIED',
          message: expect.any(String) as string,
          fields: null,
        },
      });
    }
  });

  it('fails closed with 401 when no actor was resolved', () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
