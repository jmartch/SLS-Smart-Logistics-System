import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';
import { hashSessionToken } from '../src/modules/auth/domain/session-token';

const PASSWORD = 'correct password';
const COOKIE_NAME = 'sls_session';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields: { field: string; reason: string }[] | null;
  };
}

function errorOf(response: request.Response): ErrorEnvelope['error'] {
  return (response.body as ErrorEnvelope).error;
}

function setCookieHeaders(response: request.Response): string[] {
  const value: unknown = response.headers['set-cookie'];
  return Array.isArray(value) ? (value as string[]) : [];
}

describe('Auth endpoints (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  // Everything this spec creates is tracked here so afterAll deletes only
  // those rows. Random values keep parallel or repeated runs from colliding.
  const run = randomUUID().slice(0, 8);
  const slug = `auth-e2e-${run}`;
  const otherSlug = `auth-e2e-other-${run}`;
  const activeEmail = `owner-${run}@auth-e2e.test`;
  const suspendedEmail = `suspended-${run}@auth-e2e.test`;
  const created = {
    tenantIds: [] as string[],
    userIds: [] as string[],
    roleIds: [] as string[],
  };
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;

  function http() {
    return request(app.getHttpServer());
  }

  function login(body: Record<string, unknown>) {
    return http().post('/api/auth/login').send(body);
  }

  function sessionCookie(response: request.Response): string {
    const header = setCookieHeaders(response).find((value) =>
      value.startsWith(`${COOKIE_NAME}=`),
    );
    if (!header) {
      throw new Error('login response did not set the session cookie');
    }
    return header.split(';')[0];
  }

  beforeAll(async () => {
    await admin.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const tenant = await admin.tenant.create({
      data: { name: 'Auth E2E Co', slug },
    });
    created.tenantIds.push(tenant.id);
    tenantId = tenant.id;

    const otherTenant = await admin.tenant.create({
      data: { name: 'Auth E2E Other Co', slug: otherSlug },
    });
    created.tenantIds.push(otherTenant.id);
    otherTenantId = otherTenant.id;

    const passwordHash = await hashPassword(PASSWORD);
    const user = await admin.user.create({
      data: { tenantId, email: activeEmail, passwordHash },
    });
    created.userIds.push(user.id);
    userId = user.id;

    const suspended = await admin.user.create({
      data: {
        tenantId,
        email: suspendedEmail,
        passwordHash,
        status: 'SUSPENDED',
      },
    });
    created.userIds.push(suspended.id);

    const permission = await admin.permission.findUniqueOrThrow({
      where: { code: 'MANAGE_EMPLOYEES' },
    });
    const role = await admin.role.create({
      data: { tenantId, name: `Role ${run}` },
    });
    created.roleIds.push(role.id);
    await admin.rolePermission.create({
      data: { tenantId, roleId: role.id, permissionId: permission.id },
    });
    await admin.userRole.create({
      data: { tenantId, userId, roleId: role.id },
    });
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    const attempt = async (step: () => Promise<unknown>) => {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    };
    const { tenantIds, userIds, roleIds } = created;

    // Children before parents: sessions reference users/tenants; user roles
    // and role permissions reference users/roles. The length guards keep an
    // empty id list from ever producing an unfiltered deleteMany.
    if (tenantIds.length > 0) {
      await attempt(() =>
        admin.session.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      );
      await attempt(() =>
        admin.userRole.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      );
      await attempt(() =>
        admin.rolePermission.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
      );
    }
    if (roleIds.length > 0) {
      await attempt(() =>
        admin.role.deleteMany({ where: { id: { in: roleIds } } }),
      );
    }
    if (userIds.length > 0) {
      await attempt(() =>
        admin.user.deleteMany({ where: { id: { in: userIds } } }),
      );
    }
    if (tenantIds.length > 0) {
      await attempt(() =>
        admin.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      );
    }
    await attempt(() => admin.$disconnect());
    if (app) {
      await attempt(() => app.close());
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  });

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials and sets an HttpOnly, SameSite=Lax session cookie', async () => {
      const response = await login({
        slug,
        email: activeEmail,
        password: PASSWORD,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
      const setCookie = setCookieHeaders(response)[0];
      expect(setCookie).toContain(`${COOKIE_NAME}=`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
    });

    it('answers wrong password, unknown slug, unknown email and suspended user with identical 401 bodies', async () => {
      const responses = await Promise.all([
        login({ slug, email: activeEmail, password: 'wrong' }),
        login({
          slug: `nope-${run}`,
          email: activeEmail,
          password: PASSWORD,
        }),
        login({
          slug,
          email: `nobody-${run}@auth-e2e.test`,
          password: PASSWORD,
        }),
        login({ slug, email: suspendedEmail, password: PASSWORD }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(errorOf(response).code).toBe('INVALID_CREDENTIALS');
        expect(setCookieHeaders(response)).toHaveLength(0);
      }
      for (const response of responses.slice(1)) {
        expect(response.body).toEqual(responses[0].body);
      }
    });

    it('rejects an invalid body with 400 VALIDATION_ERROR and a [{ field, reason }] list', async () => {
      const missing = await login({ slug });
      expect(missing.status).toBe(400);
      expect(errorOf(missing).code).toBe('VALIDATION_ERROR');
      const missingFields = errorOf(missing).fields ?? [];
      // email: IsEmail, MaxLength; password: IsString, MinLength, MaxLength.
      expect(missingFields).toHaveLength(5);
      expect(
        missingFields.every(
          (entry) =>
            Object.keys(entry).sort().join() === 'field,reason' &&
            typeof entry.reason === 'string',
        ),
      ).toBe(true);
      expect(
        [...new Set(missingFields.map((entry) => entry.field))].sort(),
      ).toEqual(['email', 'password']);
      expect(missingFields).toEqual(
        expect.arrayContaining([
          { field: 'email', reason: 'email must be an email' },
          { field: 'password', reason: 'password must be a string' },
        ]),
      );

      const badEmail = await login({
        slug,
        email: 'not-an-email',
        password: PASSWORD,
      });
      expect(badEmail.status).toBe(400);
      expect(errorOf(badEmail).code).toBe('VALIDATION_ERROR');
      expect(errorOf(badEmail).fields).toEqual([
        { field: 'email', reason: 'email must be an email' },
      ]);
    });

    it('rejects a malformed JSON body with 400 in the error envelope', async () => {
      const response = await http()
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"slug": ');

      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    });

    it('stores only a hash of the session token, never the cookie value', async () => {
      const response = await login({
        slug,
        email: activeEmail,
        password: PASSWORD,
      });
      const rawToken = sessionCookie(response).slice(COOKIE_NAME.length + 1);

      const sessions = await admin.session.findMany({ where: { tenantId } });

      expect(sessions.some((s) => s.tokenHash === rawToken)).toBe(false);
      expect(
        sessions.some((s) => s.tokenHash === hashSessionToken(rawToken)),
      ).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the session actor for a valid cookie', async () => {
      const cookie = sessionCookie(
        await login({ slug, email: activeEmail, password: PASSWORD }),
      );

      const response = await http().get('/api/auth/me').set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        userId,
        tenantId,
        permissions: ['MANAGE_EMPLOYEES'],
      });
    });

    it('answers 401 SESSION_EXPIRED without a cookie', async () => {
      const response = await http().get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('SESSION_EXPIRED');
      expect(errorOf(response).fields).toBeNull();
    });

    it('answers 401 (not 500) for a JSON-style cookie value', async () => {
      const response = await http()
        .get('/api/auth/me')
        .set('Cookie', `${COOKIE_NAME}=${encodeURIComponent('j:{"a":1}')}`);

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('SESSION_EXPIRED');
    });

    it('ignores a tenantId supplied in a header or query string', async () => {
      const cookie = sessionCookie(
        await login({ slug, email: activeEmail, password: PASSWORD }),
      );

      const response = await http()
        .get('/api/auth/me')
        .query({ tenantId: otherTenantId })
        .set('Cookie', cookie)
        .set('X-Tenant-Id', otherTenantId);

      expect(response.status).toBe(200);
      const me = response.body as { tenantId: string };
      expect(me.tenantId).toBe(tenantId);
      expect(me.tenantId).not.toBe(otherTenantId);
    });
  });

  // Status changes are written directly through the admin client, bypassing
  // the API, to simulate a session that survived a deactivation (for example
  // a revocation that failed after the status change committed).
  describe('sessions of actors that may no longer act', () => {
    let fixtureCounter = 0;

    async function freshTenantUser(withRole: boolean) {
      fixtureCounter += 1;
      const fixtureSlug = `auth-e2e-state-${fixtureCounter}-${run}`;
      const tenant = await admin.tenant.create({
        data: { name: `Auth E2E State ${fixtureCounter}`, slug: fixtureSlug },
      });
      created.tenantIds.push(tenant.id);
      const email = `state-${fixtureCounter}-${run}@auth-e2e.test`;
      const user = await admin.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash: await hashPassword(PASSWORD),
        },
      });
      created.userIds.push(user.id);
      if (withRole) {
        const permission = await admin.permission.findUniqueOrThrow({
          where: { code: 'REGISTER_PACKAGES' },
        });
        const role = await admin.role.create({
          data: { tenantId: tenant.id, name: `State role ${run}` },
        });
        created.roleIds.push(role.id);
        await admin.rolePermission.create({
          data: {
            tenantId: tenant.id,
            roleId: role.id,
            permissionId: permission.id,
          },
        });
        await admin.userRole.create({
          data: { tenantId: tenant.id, userId: user.id, roleId: role.id },
        });
      }
      const cookie = sessionCookie(
        await login({ slug: fixtureSlug, email, password: PASSWORD }),
      );
      const me = await http().get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(200);

      return {
        tenantId: tenant.id,
        slug: fixtureSlug,
        email,
        userId: user.id,
        cookie,
      };
    }

    async function liveSessionsOf(userIdToCount: string): Promise<number> {
      return admin.session.count({
        where: { userId: userIdToCount, revokedAt: null },
      });
    }

    it('keeps an ACTIVE user without roles authenticated, with no permissions', async () => {
      const actor = await freshTenantUser(false);

      const me = await http().get('/api/auth/me').set('Cookie', actor.cookie);

      expect(me.status).toBe(200);
      expect((me.body as { permissions: string[] }).permissions).toEqual([]);
    });

    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      'answers 401 to a live session of a user set %s, revokes it, and only a new login restores access',
      async (status) => {
        const actor = await freshTenantUser(true);
        await admin.user.update({
          where: { id: actor.userId },
          data: { status },
        });

        const me = await http().get('/api/auth/me').set('Cookie', actor.cookie);
        expect(me.status).toBe(401);
        expect(errorOf(me)).toEqual({
          code: 'SESSION_EXPIRED',
          message: expect.any(String) as string,
          fields: null,
        });
        expect(await liveSessionsOf(actor.userId)).toBe(0);

        // Reactivated: the rejected session stays revoked; a new login works.
        await admin.user.update({
          where: { id: actor.userId },
          data: { status: 'ACTIVE' },
        });
        const stale = await http()
          .get('/api/auth/me')
          .set('Cookie', actor.cookie);
        expect(stale.status).toBe(401);
        const relogin = await login({
          slug: actor.slug,
          email: actor.email,
          password: PASSWORD,
        });
        expect(relogin.status).toBe(200);
        const fresh = await http()
          .get('/api/auth/me')
          .set('Cookie', sessionCookie(relogin));
        expect(fresh.status).toBe(200);
      },
    );

    it('answers 401 to a live session whose tenant was SUSPENDED and revokes it', async () => {
      const actor = await freshTenantUser(true);
      await admin.tenant.update({
        where: { id: actor.tenantId },
        data: { status: 'SUSPENDED' },
      });

      const me = await http().get('/api/auth/me').set('Cookie', actor.cookie);

      expect(me.status).toBe(401);
      expect(errorOf(me).code).toBe('SESSION_EXPIRED');
      expect(await liveSessionsOf(actor.userId)).toBe(0);
    });

    it('lets a session that was never used while the user was inactive work again after reactivation', async () => {
      // Resolution revokes a session only when it is presented while its
      // actor is inactive. A deactivation through the API revokes every
      // session; this direct write does not, so the session survives here.
      const actor = await freshTenantUser(true);
      await admin.user.update({
        where: { id: actor.userId },
        data: { status: 'INACTIVE' },
      });
      await admin.user.update({
        where: { id: actor.userId },
        data: { status: 'ACTIVE' },
      });

      const me = await http().get('/api/auth/me').set('Cookie', actor.cookie);

      expect(me.status).toBe(200);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const cookie = sessionCookie(
        await login({ slug, email: activeEmail, password: PASSWORD }),
      );

      const logout = await http()
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(logout.status).toBe(200);
      expect(logout.body).toEqual({ ok: true });
      const cleared = setCookieHeaders(logout)[0];
      expect(cleared).toContain(`${COOKIE_NAME}=;`);
      expect(cleared).toContain('HttpOnly');
      expect(cleared).toContain('SameSite=Lax');
      expect(cleared).toContain('Expires=Thu, 01 Jan 1970');

      const me = await http().get('/api/auth/me').set('Cookie', cookie);
      expect(me.status).toBe(401);
      expect(errorOf(me).code).toBe('SESSION_EXPIRED');
    });

    it('is harmless without a cookie or with a non-string cookie', async () => {
      const without = await http().post('/api/auth/logout');
      expect(without.status).toBe(200);

      const jsonCookie = await http()
        .post('/api/auth/logout')
        .set('Cookie', `${COOKIE_NAME}=${encodeURIComponent('j:{"a":1}')}`);
      expect(jsonCookie.status).toBe(200);
      expect(jsonCookie.body).toEqual({ ok: true });
    });
  });
});
