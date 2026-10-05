import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import type {
  PermissionLoader,
  ResolveSessionService,
} from '../application/resolve-session.service';
import type { TenantUserLookupRepository } from '../domain/tenant-user-lookup.repository';
import type { ActorContext } from '../../../shared/application/actor-context';

interface FakeRequest {
  cookies?: Record<string, unknown>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  actor?: ActorContext;
}

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function build(resolved: ActorContext | null) {
  const resolve = jest.fn().mockResolvedValue(resolved);
  const resolveSession = { resolve } as unknown as ResolveSessionService;
  const findPermissionsForUser = jest.fn().mockResolvedValue(['P1']);
  const lookup: TenantUserLookupRepository = {
    findTenantBySlug: jest.fn(),
    findUserForLogin: jest.fn(),
    findPermissionsForUser,
  };
  return {
    guard: new AuthGuard(resolveSession, lookup),
    resolve,
    findPermissionsForUser,
  };
}

function loaderPassedTo(resolve: jest.Mock): PermissionLoader {
  return (resolve.mock.calls[0] as [string, PermissionLoader])[1];
}

async function captureUnauthorized(
  promise: Promise<unknown>,
): Promise<UnauthorizedException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected UnauthorizedException, but nothing was thrown');
}

const tenantActor: ActorContext = {
  kind: 'TENANT_USER',
  tenantId: 'tenant-a',
  userId: 'user-1',
  permissions: new Set(['P1']),
};

describe('AuthGuard', () => {
  it('rejects a request without the session cookie using the 401 envelope', async () => {
    const { guard, resolve } = build(tenantActor);

    const error = await captureUnauthorized(
      guard.canActivate(contextFor({ cookies: {} })),
    );

    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toEqual({
      error: {
        code: 'SESSION_EXPIRED',
        message: expect.any(String) as string,
        fields: null,
      },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['a parsed JSON object (j: cookie)', { a: 1 }],
    ['an array', ['a', 'b']],
    ['a number', 42],
    ['an empty string', ''],
  ])(
    'rejects a non-string or empty session cookie (%s) without calling resolve',
    async (_label, value) => {
      const { guard, resolve } = build(tenantActor);

      const error = await captureUnauthorized(
        guard.canActivate(contextFor({ cookies: { sls_session: value } })),
      );

      expect(error.getStatus()).toBe(401);
      expect(error.getResponse()).toEqual({
        error: {
          code: 'SESSION_EXPIRED',
          message: expect.any(String) as string,
          fields: null,
        },
      });
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('treats an undefined request.cookies (no cookie-parser) as no session', async () => {
    const { guard, resolve } = build(tenantActor);

    const error = await captureUnauthorized(guard.canActivate(contextFor({})));

    expect(error.getResponse()).toMatchObject({
      error: { code: 'SESSION_EXPIRED', fields: null },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects when the session cannot be resolved (unknown, expired or revoked)', async () => {
    const { guard, resolve } = build(null);

    const error = await captureUnauthorized(
      guard.canActivate(contextFor({ cookies: { sls_session: 'stale' } })),
    );

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toEqual({
      error: {
        code: 'SESSION_EXPIRED',
        message: expect.any(String) as string,
        fields: null,
      },
    });
  });

  it('attaches the resolved actor to the request and allows it through', async () => {
    const { guard, resolve } = build(tenantActor);
    const request: FakeRequest = { cookies: { sls_session: 'raw-token' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.actor).toBe(tenantActor);
    expect(resolve).toHaveBeenCalledWith('raw-token', expect.any(Function));
  });

  describe('with a pre-existing request.actor', () => {
    const forged: ActorContext = {
      kind: 'TENANT_USER',
      tenantId: 'tenant-forged',
      userId: 'user-forged',
      permissions: new Set(['EVERYTHING']),
    };

    it('does not let a forged actor survive an unresolved session', async () => {
      const { guard } = build(null);
      const request: FakeRequest = {
        cookies: { sls_session: 'stale' },
        actor: forged,
      };

      await expect(
        guard.canActivate(contextFor(request)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('replaces a forged actor with the one resolved from the session', async () => {
      const { guard } = build(tenantActor);
      const request: FakeRequest = {
        cookies: { sls_session: 'raw-token' },
        actor: forged,
      };

      await guard.canActivate(contextFor(request));

      expect(request.actor).toBe(tenantActor);
    });
  });

  it('also attaches a platform-admin actor unchanged', async () => {
    const admin: ActorContext = {
      kind: 'PLATFORM_ADMIN',
      platformAdminId: 'admin-1',
    };
    const { guard } = build(admin);
    const request: FakeRequest = { cookies: { sls_session: 'raw-token' } };

    await guard.canActivate(contextFor(request));

    expect(request.actor).toBe(admin);
  });

  it('delegates the permission loader to the lookup with the arguments resolve provides', async () => {
    const { guard, resolve, findPermissionsForUser } = build(tenantActor);

    await guard.canActivate(
      contextFor({ cookies: { sls_session: 'raw-token' } }),
    );

    const loader = loaderPassedTo(resolve);
    await expect(
      loader('tenant-from-session', 'user-from-session'),
    ).resolves.toEqual(['P1']);
    expect(findPermissionsForUser).toHaveBeenCalledTimes(1);
    expect(findPermissionsForUser).toHaveBeenCalledWith(
      'tenant-from-session',
      'user-from-session',
    );
  });

  it('never takes tenant information from headers, query or body', async () => {
    const { guard, resolve, findPermissionsForUser } = build(tenantActor);
    const request: FakeRequest = {
      cookies: { sls_session: 'raw-token' },
      headers: { 'x-tenant-id': 'tenant-attacker' },
      query: { tenantId: 'tenant-attacker' },
      body: { tenantId: 'tenant-attacker' },
    };

    await guard.canActivate(contextFor(request));

    // The actor is exactly what the session resolved to, untouched by input.
    expect(request.actor).toBe(tenantActor);
    await loaderPassedTo(resolve)('tenant-a', 'user-1');
    expect(findPermissionsForUser).toHaveBeenCalledWith('tenant-a', 'user-1');
    expect(JSON.stringify(resolve.mock.calls)).not.toContain('tenant-attacker');
    expect(JSON.stringify(findPermissionsForUser.mock.calls)).not.toContain(
      'tenant-attacker',
    );
  });
});
