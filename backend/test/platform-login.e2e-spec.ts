import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';
import { hashSessionToken } from '../src/modules/auth/domain/session-token';

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

describe('Platform admin login (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  // This spec creates its own platform admins (never the seeded one), with
  // random emails and a runtime-generated password that is never logged.
  // Created ids are tracked so afterAll deletes only those rows.
  const run = randomUUID().slice(0, 8);
  const activeEmail = `platform-${run}@platform-e2e.test`;
  const inactiveEmail = `platform-inactive-${run}@platform-e2e.test`;
  const password = randomBytes(18).toString('base64url');
  const created = { platformAdminIds: [] as string[] };
  let platformAdminId: string;

  function http() {
    return request(app.getHttpServer());
  }

  function login(body: Record<string, unknown>) {
    return http().post('/api/platform/login').send(body);
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

    const passwordHash = await hashPassword(password);
    const active = await admin.platformAdmin.create({
      data: { email: activeEmail, passwordHash },
    });
    created.platformAdminIds.push(active.id);
    platformAdminId = active.id;

    const inactive = await admin.platformAdmin.create({
      data: { email: inactiveEmail, passwordHash, status: 'INACTIVE' },
    });
    created.platformAdminIds.push(inactive.id);
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
    const { platformAdminIds } = created;

    // Sessions reference the platform admin, so they go first. The length
    // guard keeps an empty id list from ever producing an unfiltered delete.
    if (platformAdminIds.length > 0) {
      await attempt(() =>
        admin.session.deleteMany({
          where: { platformAdminId: { in: platformAdminIds } },
        }),
      );
      await attempt(() =>
        admin.platformAdmin.deleteMany({
          where: { id: { in: platformAdminIds } },
        }),
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

  it('logs in with correct credentials and sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const response = await login({ email: activeEmail, password });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    const setCookie = setCookieHeaders(response)[0];
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toMatch(/;\s*Path=\/(;|$)/);
    const expires = /;\s*Expires=([^;]+)/.exec(setCookie)?.[1];
    expect(expires).toBeDefined();
    // The cookie must outlive the request but not the 12h session window.
    const lifetimeMs = new Date(expires as string).getTime() - Date.now();
    expect(lifetimeMs).toBeGreaterThan(0);
    expect(lifetimeMs).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
  });

  it('stores only a hash of the session token for the platform admin', async () => {
    const response = await login({ email: activeEmail, password });
    const rawToken = sessionCookie(response).slice(COOKIE_NAME.length + 1);

    const sessions = await admin.session.findMany({
      where: { platformAdminId },
    });

    expect(sessions.some((s) => s.tokenHash === rawToken)).toBe(false);
    const stored = sessions.find(
      (s) => s.tokenHash === hashSessionToken(rawToken),
    );
    expect(stored?.actorType).toBe('PLATFORM_ADMIN');
    expect(stored?.tenantId).toBeNull();
    expect(stored?.userId).toBeNull();
  });

  it('accepts an email written with different letter case', async () => {
    const response = await login({
      email: activeEmail.toUpperCase(),
      password,
    });

    expect(response.status).toBe(200);
  });

  it('opens a session that /api/auth/me reports as the platform admin', async () => {
    const cookie = sessionCookie(await login({ email: activeEmail, password }));

    const response = await http().get('/api/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ platformAdminId, email: activeEmail });
    expect(response.text).not.toContain('$argon2');
  });

  it('answers wrong password, unknown email and inactive admin with identical 401 bodies', async () => {
    const responses = await Promise.all([
      login({ email: activeEmail, password: `${password}-wrong` }),
      login({ email: `nobody-${run}@platform-e2e.test`, password }),
      login({ email: inactiveEmail, password }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('INVALID_CREDENTIALS');
      expect(errorOf(response).fields).toBeNull();
      expect(setCookieHeaders(response)).toHaveLength(0);
    }
    for (const response of responses.slice(1)) {
      expect(response.body).toEqual(responses[0].body);
    }
  });

  it('rejects an invalid body with 400 VALIDATION_ERROR and a [{ field, reason }] list', async () => {
    const missing = await login({});
    expect(missing.status).toBe(400);
    expect(errorOf(missing).code).toBe('VALIDATION_ERROR');
    expect(errorOf(missing).fields).toEqual(
      expect.arrayContaining([
        { field: 'email', reason: 'email must be an email' },
        { field: 'password', reason: 'password must be a string' },
      ]),
    );

    const badEmail = await login({ email: 'not-an-email', password });
    expect(badEmail.status).toBe(400);
    expect(errorOf(badEmail).fields).toEqual([
      { field: 'email', reason: 'email must be an email' },
    ]);

    const oversized = await login({
      email: activeEmail,
      password: 'x'.repeat(1025),
    });
    expect(oversized.status).toBe(400);
    expect(errorOf(oversized).code).toBe('VALIDATION_ERROR');
    expect(errorOf(oversized).fields).toEqual([
      {
        field: 'password',
        reason: 'password must be shorter than or equal to 1024 characters',
      },
    ]);
  });

  it('revokes the session on logout so /api/auth/me answers 401', async () => {
    const cookie = sessionCookie(await login({ email: activeEmail, password }));

    const logout = await http().post('/api/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(200);

    const me = await http().get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
    expect(errorOf(me).code).toBe('SESSION_EXPIRED');
  });

  it('rejects the live session of a platform admin set INACTIVE after login, and revokes it', async () => {
    // A dedicated admin, so the shared active one keeps working for others.
    const email = `platform-demoted-${run}@platform-e2e.test`;
    const demoted = await admin.platformAdmin.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
    created.platformAdminIds.push(demoted.id);
    const cookie = sessionCookie(await login({ email, password }));
    expect(
      (await http().get('/api/auth/me').set('Cookie', cookie)).status,
    ).toBe(200);

    await admin.platformAdmin.update({
      where: { id: demoted.id },
      data: { status: 'INACTIVE' },
    });

    const me = await http().get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
    expect(errorOf(me)).toEqual({
      code: 'SESSION_EXPIRED',
      message: expect.any(String) as string,
      fields: null,
    });
    // Platform endpoints are refused before validation: nothing is created.
    const provision = await http()
      .post('/api/platform/tenants')
      .set('Cookie', cookie)
      .send({});
    expect(provision.status).toBe(401);
    expect(errorOf(provision).code).toBe('SESSION_EXPIRED');
    expect(
      await admin.session.count({
        where: { platformAdminId: demoted.id, revokedAt: null },
      }),
    ).toBe(0);
  });
});
