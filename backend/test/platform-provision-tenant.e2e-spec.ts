import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';

const COOKIE_NAME = 'sls_session';
const ALL_PERMISSIONS = [
  'CLASSIFY_PACKAGES',
  'COORDINATE_ROUTES',
  'MANAGE_EMPLOYEES',
  'MANAGE_TENANT',
  'OPERATE_DELIVERIES',
  'REGISTER_PACKAGES',
];

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

function sessionCookie(response: request.Response): string {
  const value: unknown = response.headers['set-cookie'];
  const headers = Array.isArray(value) ? (value as string[]) : [];
  const header = headers.find((h) => h.startsWith(`${COOKIE_NAME}=`));
  if (!header) {
    throw new Error('login response did not set the session cookie');
  }
  return header.split(';')[0];
}

describe('POST /api/platform/tenants (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  // This spec creates its own platform admin (never the seeded one) with a
  // runtime-generated password that is never logged, and random tenant names
  // so repeated runs never collide. Every created id is tracked for cleanup.
  const run = randomUUID().slice(0, 8);
  const platformEmail = `provision-${run}@platform-e2e.test`;
  const platformPassword = randomBytes(18).toString('base64url');
  const tenantName = `Provision E2E ${run}`;
  const expectedSlug = `provision-e2e-${run}`;
  const firstAdminEmail = `owner-${run}@provision-e2e.test`;
  const firstAdminPassword = randomBytes(18).toString('base64url');
  const created = {
    platformAdminIds: [] as string[],
    tenantIds: [] as string[],
    slugs: [expectedSlug] as string[],
  };
  let platformAdminId: string;
  let platformCookie: string;
  let provisionedTenantId: string | undefined;

  function http() {
    return request(app.getHttpServer());
  }

  function provision(body: Record<string, unknown>, cookie?: string) {
    const req = http().post('/api/platform/tenants');
    if (cookie) {
      void req.set('Cookie', cookie);
    }
    return req.send(body);
  }

  function requireProvisioned(): string {
    if (!provisionedTenantId) {
      throw new Error('the provisioning test did not create the tenant');
    }
    return provisionedTenantId;
  }

  async function loginFirstAdmin(): Promise<string> {
    const response = await http().post('/api/auth/login').send({
      slug: expectedSlug,
      email: firstAdminEmail,
      password: firstAdminPassword,
    });
    expect(response.status).toBe(200);
    return sessionCookie(response);
  }

  beforeAll(async () => {
    await admin.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const platformAdmin = await admin.platformAdmin.create({
      data: {
        email: platformEmail,
        passwordHash: await hashPassword(platformPassword),
      },
    });
    created.platformAdminIds.push(platformAdmin.id);
    platformAdminId = platformAdmin.id;

    const login = await http()
      .post('/api/platform/login')
      .send({ email: platformEmail, password: platformPassword });
    expect(login.status).toBe(200);
    platformCookie = sessionCookie(login);
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

    // Tenants created by a request whose response was never recorded are
    // recovered by this run's slugs only, never by a broader filter.
    await attempt(async () => {
      const leftovers = await admin.tenant.findMany({
        where: { slug: { in: created.slugs } },
        select: { id: true },
      });
      for (const { id } of leftovers) {
        if (!created.tenantIds.includes(id)) {
          created.tenantIds.push(id);
        }
      }
    });

    // Children before parents. Length guards keep an empty id list from
    // ever producing an unfiltered deleteMany.
    const { tenantIds, platformAdminIds } = created;
    if (tenantIds.length > 0) {
      const byTenant = { where: { tenantId: { in: tenantIds } } };
      await attempt(() => admin.session.deleteMany(byTenant));
      await attempt(() => admin.auditLog.deleteMany(byTenant));
      await attempt(() => admin.userRole.deleteMany(byTenant));
      await attempt(() => admin.rolePermission.deleteMany(byTenant));
      await attempt(() => admin.role.deleteMany(byTenant));
      await attempt(() => admin.user.deleteMany(byTenant));
      await attempt(() =>
        admin.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      );
    }
    if (platformAdminIds.length > 0) {
      const byAdmin = { in: platformAdminIds };
      await attempt(() =>
        admin.session.deleteMany({ where: { platformAdminId: byAdmin } }),
      );
      await attempt(() =>
        admin.auditLog.deleteMany({ where: { actorPlatformAdminId: byAdmin } }),
      );
      await attempt(() =>
        admin.platformAdmin.deleteMany({ where: { id: byAdmin } }),
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

  it('creates the tenant and answers 201 with only its id and slug', async () => {
    const response = await provision(
      {
        name: tenantName,
        // Stored lowercased; the login below uses the lowercase form.
        adminEmail: firstAdminEmail.toUpperCase(),
        adminPassword: firstAdminPassword,
        // Not part of the contract: the actor comes only from the session.
        actorPlatformAdminId: randomUUID(),
      },
      platformCookie,
    );

    expect(response.status).toBe(201);
    const body = response.body as { tenantId: string; slug: string };
    if (typeof body.tenantId === 'string') {
      created.tenantIds.push(body.tenantId);
      provisionedTenantId = body.tenantId;
    }
    expect(Object.keys(body).sort()).toEqual(['slug', 'tenantId']);
    expect(body.slug).toBe(expectedSlug);
    expect(response.text).not.toContain(firstAdminPassword);
    expect(response.text).not.toContain('$argon2');
    expect(response.text.toLowerCase()).not.toContain('password');
  });

  it('lets the first administrator log in with the returned slug and carry all six permissions', async () => {
    const tenantId = requireProvisioned();
    const cookie = await loginFirstAdmin();

    const me = await http().get('/api/auth/me').set('Cookie', cookie);

    expect(me.status).toBe(200);
    const body = me.body as {
      tenantId: string;
      email: string;
      roles: { id: string; name: string }[];
      permissions: string[];
    };
    expect(body.tenantId).toBe(tenantId);
    expect([...body.permissions].sort()).toEqual(ALL_PERMISSIONS);
    // The provisioning request sent the email upper-cased; it is stored
    // normalized, and the first admin holds exactly the Administrador role.
    expect(body.email).toBe(firstAdminEmail);
    const adminRole = await admin.role.findFirstOrThrow({
      where: { tenantId, name: 'Administrador' },
    });
    expect(body.roles).toEqual([{ id: adminRole.id, name: 'Administrador' }]);
  });

  it('records a TENANT_PROVISIONED audit row for the session platform admin without the password', async () => {
    const tenantId = requireProvisioned();

    const audits = await admin.auditLog.findMany({ where: { tenantId } });

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'TENANT_PROVISIONED',
      entityType: 'Tenant',
      entityId: tenantId,
      actorPlatformAdminId: platformAdminId,
      actorUserId: null,
    });
    const metadata = JSON.stringify(audits[0].metadata);
    expect(metadata).toContain(firstAdminEmail);
    expect(metadata).not.toContain(firstAdminPassword);
    expect(metadata).not.toContain('$argon2');
  });

  it('answers 409 TENANT_SLUG_ALREADY_EXISTS for a name that produces an existing slug', async () => {
    requireProvisioned();

    const response = await provision(
      {
        name: tenantName.toUpperCase(),
        adminEmail: `someone-else-${run}@provision-e2e.test`,
        adminPassword: firstAdminPassword,
      },
      platformCookie,
    );

    expect(response.status).toBe(409);
    expect(errorOf(response)).toEqual({
      code: 'TENANT_SLUG_ALREADY_EXISTS',
      message: expect.any(String) as string,
      fields: null,
    });
  });

  it('answers 403 PERMISSION_DENIED to a tenant user, before validating the body', async () => {
    requireProvisioned();
    const tenantCookie = await loginFirstAdmin();
    const otherSlug = `provision-e2e-forbidden-${run}`;
    created.slugs.push(otherSlug);

    const valid = await provision(
      {
        name: `Provision E2E Forbidden ${run}`,
        adminEmail: `forbidden-${run}@provision-e2e.test`,
        adminPassword: firstAdminPassword,
      },
      tenantCookie,
    );
    expect(valid.status).toBe(403);
    expect(errorOf(valid).code).toBe('PERMISSION_DENIED');

    const invalid = await provision({}, tenantCookie);
    expect(invalid.status).toBe(403);
    expect(errorOf(invalid).code).toBe('PERMISSION_DENIED');

    expect(await admin.tenant.count({ where: { slug: otherSlug } })).toBe(0);
  });

  it('answers 401 SESSION_EXPIRED without a session cookie', async () => {
    const slug = `provision-e2e-anonymous-${run}`;
    created.slugs.push(slug);

    const response = await provision({
      name: `Provision E2E Anonymous ${run}`,
      adminEmail: `anonymous-${run}@provision-e2e.test`,
      adminPassword: firstAdminPassword,
    });

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe('SESSION_EXPIRED');
    expect(await admin.tenant.count({ where: { slug } })).toBe(0);
  });

  it('rejects an invalid body with 400 VALIDATION_ERROR and a [{ field, reason }] list', async () => {
    const missing = await provision({}, platformCookie);
    expect(missing.status).toBe(400);
    expect(errorOf(missing).code).toBe('VALIDATION_ERROR');
    const fields = errorOf(missing).fields ?? [];
    expect([...new Set(fields.map((f) => f.field))].sort()).toEqual([
      'adminEmail',
      'adminPassword',
      'name',
    ]);

    const shortPassword = await provision(
      {
        name: `Provision E2E Short ${run}`,
        adminEmail: `short-${run}@provision-e2e.test`,
        adminPassword: 'short',
      },
      platformCookie,
    );
    expect(shortPassword.status).toBe(400);
    expect(errorOf(shortPassword).fields).toEqual([
      {
        field: 'adminPassword',
        reason: 'adminPassword must be longer than or equal to 8 characters',
      },
    ]);
  });

  it('rejects a name without letters or digits with 400 VALIDATION_ERROR on the name field', async () => {
    const response = await provision(
      {
        name: '!!!',
        adminEmail: `symbols-${run}@provision-e2e.test`,
        adminPassword: firstAdminPassword,
      },
      platformCookie,
    );

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(errorOf(response).fields).toEqual([
      { field: 'name', reason: expect.any(String) as string },
    ]);
  });
});
