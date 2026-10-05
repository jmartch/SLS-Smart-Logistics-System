import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import type { ActorContext } from '../../../shared/application/actor-context';

@RequirePermission('MANAGE_EMPLOYEES')
class ClassLevelController {
  inherited(): void {}

  @RequirePermission('REGISTER_PACKAGES')
  overridden(): void {}
}

class UndecoratedController {
  open(): void {}

  @RequirePermission('MANAGE_EMPLOYEES')
  guarded(): void {}
}

function contextFor(
  controller: new () => object,
  handlerName: string,
  actor: ActorContext | undefined,
): ExecutionContext {
  const handler = (controller.prototype as Record<string, unknown>)[
    handlerName
  ] as () => void;

  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as ExecutionContext;
}

function tenantUser(permissions: string[]): ActorContext {
  return {
    kind: 'TENANT_USER',
    tenantId: 't-1',
    userId: 'u-1',
    permissions: new Set(permissions),
  };
}

function expectPermissionDenied(action: () => unknown): void {
  try {
    action();
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
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('lets a tenant user holding the required permission through', () => {
    expect(
      guard.canActivate(
        contextFor(
          UndecoratedController,
          'guarded',
          tenantUser(['MANAGE_EMPLOYEES']),
        ),
      ),
    ).toBe(true);
  });

  it('rejects a tenant user lacking the required permission with 403 PERMISSION_DENIED', () => {
    expectPermissionDenied(() =>
      guard.canActivate(
        contextFor(
          UndecoratedController,
          'guarded',
          tenantUser(['OPERATE_DELIVERIES']),
        ),
      ),
    );
  });

  it('rejects a platform admin on a tenant permission route with 403 PERMISSION_DENIED', () => {
    expectPermissionDenied(() =>
      guard.canActivate(
        contextFor(UndecoratedController, 'guarded', {
          kind: 'PLATFORM_ADMIN',
          platformAdminId: 'p-1',
        }),
      ),
    );
  });

  it('applies a class-level requirement to every handler', () => {
    expectPermissionDenied(() =>
      guard.canActivate(
        contextFor(
          ClassLevelController,
          'inherited',
          tenantUser(['REGISTER_PACKAGES']),
        ),
      ),
    );
    expect(
      guard.canActivate(
        contextFor(
          ClassLevelController,
          'inherited',
          tenantUser(['MANAGE_EMPLOYEES']),
        ),
      ),
    ).toBe(true);
  });

  it('lets a handler-level requirement override the class-level one', () => {
    expect(
      guard.canActivate(
        contextFor(
          ClassLevelController,
          'overridden',
          tenantUser(['REGISTER_PACKAGES']),
        ),
      ),
    ).toBe(true);
    expectPermissionDenied(() =>
      guard.canActivate(
        contextFor(
          ClassLevelController,
          'overridden',
          tenantUser(['MANAGE_EMPLOYEES']),
        ),
      ),
    );
  });

  it('allows any authenticated actor when no permission is declared', () => {
    expect(
      guard.canActivate(
        contextFor(UndecoratedController, 'open', tenantUser([])),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        contextFor(UndecoratedController, 'open', {
          kind: 'PLATFORM_ADMIN',
          platformAdminId: 'p-1',
        }),
      ),
    ).toBe(true);
  });

  it('fails closed with 401 when AuthGuard did not resolve an actor', () => {
    expect(() =>
      guard.canActivate(
        contextFor(UndecoratedController, 'guarded', undefined),
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guard.canActivate(contextFor(UndecoratedController, 'open', undefined)),
    ).toThrow(UnauthorizedException);
  });
});
