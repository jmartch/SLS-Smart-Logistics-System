import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import { runWithTenant } from '../src/database/run-with-tenant';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';
import { hashSessionToken } from '../src/modules/auth/domain/session-token';

const COOKIE_NAME = 'sls_session';

// Postgres messages, as surfaced through Prisma: an RLS policy rejection and a
// composite foreign key rejection are different mechanisms and must not be
// confused with each other.
const RLS_VIOLATION = /row-level security/i;
const FOREIGN_KEY_VIOLATION = /foreign key/i;

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields: { field: string; reason: string }[] | null;
  };
}

interface EmployeeBody {
  id: string;
  email: string;
  status: string;
  roleIds: string[];
}

interface MeBody {
  userId: string;
  tenantId: string;
  email: string;
  roles: { id: string; name: string }[];
  permissions: string[];
}

interface UserFixture {
  id: string;
  email: string;
}

interface TenantFixture {
  id: string;
  slug: string;
  password: string;
  adminRoleId: string;
  extraRoleId: string;
  adminUser: UserFixture;
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

function rawToken(cookie: string): string {
  return cookie.slice(`${COOKIE_NAME}=`.length);
}

// Same status, same bytes: the response must not tell the two cases apart.
function expectIndistinguishable(
  first: request.Response,
  second: request.Response,
): void {
  expect(first.status).toBe(second.status);
  expect(first.text).toBe(second.text);
}

describe('Tenant isolation over HTTP (e2e)', () => {
  jest.setTimeout(90_000);

  let app: INestApplication;
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  // The runtime (sls_app) connection, the one the API itself uses.
  const runtime = new PrismaService();

  // Random per run and never logged: slugs, emails and passwords. The two
  // tenants use different passwords on purpose, and the same admin email.
  const run = randomUUID().slice(0, 8);
  const sharedEmail = `shared-${run}@isolation-e2e.test`;
  // Name of the tenant a REGRESSED provisioning authorization check would
  // create; the run id keeps the match to this run only.
  const deniedTenantName = `Denied ${run}`;
  let userCounter = 0;
  const created = {
    tenantIds: [] as string[],
    userIds: [] as string[],
    platformAdminIds: [] as string[],
  };

  let manageEmployeesId: string;
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let hashByPassword: Map<string, string>;
  let cookieAdminA: string;
  let cookieAdminB: string;

  function http() {
    return request(app.getHttpServer());
  }

  async function createTenant(label: string): Promise<TenantFixture> {
    const password = randomBytes(18).toString('base64url');
    const passwordHash = await hashPassword(password);
    hashByPassword.set(password, passwordHash);

    const tenant = await admin.tenant.create({
      data: {
        name: `Isolation E2E ${label} ${run}`,
        slug: `isolation-e2e-${label}-${run}`,
      },
    });
    created.tenantIds.push(tenant.id);

    const adminRole = await admin.role.create({
      data: { tenantId: tenant.id, name: 'Administrador' },
    });
    await admin.rolePermission.create({
      data: {
        tenantId: tenant.id,
        roleId: adminRole.id,
        permissionId: manageEmployeesId,
      },
    });
    // A role without permissions: assignable, but grants nothing.
    const extraRole = await admin.role.create({
      data: { tenantId: tenant.id, name: 'Auxiliar' },
    });

    const fixture: TenantFixture = {
      id: tenant.id,
      slug: tenant.slug,
      password,
      adminRoleId: adminRole.id,
      extraRoleId: extraRole.id,
      adminUser: { id: '', email: sharedEmail },
    };
    fixture.adminUser = await createUser(fixture, [adminRole.id], sharedEmail);
    return fixture;
  }

  async function createUser(
    tenant: TenantFixture,
    roleIds: string[],
    email?: string,
  ): Promise<UserFixture> {
    userCounter += 1;
    const address =
      email ?? `employee-${userCounter}-${run}@isolation-e2e.test`;
    const passwordHash = hashByPassword.get(tenant.password);
    if (!passwordHash) {
      throw new Error('missing password hash for the tenant fixture');
    }
    const user = await admin.user.create({
      data: { tenantId: tenant.id, email: address, passwordHash },
    });
    created.userIds.push(user.id);
    if (roleIds.length > 0) {
      await admin.userRole.createMany({
        data: roleIds.map((roleId) => ({
          tenantId: tenant.id,
          userId: user.id,
          roleId,
        })),
      });
    }
    return { id: user.id, email: address };
  }

  function loginRequest(slug: string, email: string, password: string) {
    return http().post('/api/auth/login').send({ slug, email, password });
  }

  async function login(
    tenant: TenantFixture,
    user: UserFixture,
  ): Promise<string> {
    const response = await loginRequest(
      tenant.slug,
      user.email,
      tenant.password,
    );
    expect(response.status).toBe(200);
    return sessionCookie(response);
  }

  function me(cookie: string) {
    return http().get('/api/auth/me').set('Cookie', cookie);
  }

  function listEmployees(cookie: string) {
    return http().get('/api/users').set('Cookie', cookie);
  }

  function createEmployee(cookie: string, body: Record<string, unknown>) {
    return http().post('/api/users').set('Cookie', cookie).send(body);
  }

  function patchStatus(cookie: string, id: string, status: unknown) {
    return http()
      .patch(`/api/users/${id}/status`)
      .set('Cookie', cookie)
      .send({ status });
  }

  function patchRoles(cookie: string, id: string, roleIds: unknown) {
    return http()
      .patch(`/api/users/${id}/roles`)
      .set('Cookie', cookie)
      .send({ roleIds });
  }

  function newEmployeeBody(tenant: TenantFixture, roleIds: string[]) {
    userCounter += 1;
    return {
      email: `api-${userCounter}-${run}@isolation-e2e.test`,
      password: tenant.password,
      roleIds,
    };
  }

  async function statusOf(userId: string): Promise<string> {
    return (await admin.user.findUniqueOrThrow({ where: { id: userId } }))
      .status;
  }

  async function roleIdsOf(userId: string): Promise<string[]> {
    const rows = await admin.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    return rows.map((row) => row.roleId).sort();
  }

  // Everything tenant-owned the identity module stores, without hashes, so a
  // mismatch diff never prints credentials.
  async function snapshot(tenantId: string) {
    const where = { tenantId };
    return {
      users: await admin.user.findMany({
        where,
        select: { id: true, email: true, status: true },
        orderBy: { id: 'asc' },
      }),
      roles: await admin.role.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      }),
      userRoles: await admin.userRole.findMany({
        where,
        select: { userId: true, roleId: true },
        orderBy: [{ userId: 'asc' }, { roleId: 'asc' }],
      }),
      rolePermissions: await admin.rolePermission.findMany({
        where,
        select: { roleId: true, permissionId: true },
        orderBy: [{ roleId: 'asc' }, { permissionId: 'asc' }],
      }),
    };
  }

  function activeSessionCount(tenantId: string): Promise<number> {
    return admin.session.count({ where: { tenantId, revokedAt: null } });
  }

  beforeAll(async () => {
    await admin.$connect();
    await runtime.onModuleInit();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    // Seeded, global row: read by code, never created or deleted here.
    const manage = await admin.permission.findUnique({
      where: { code: 'MANAGE_EMPLOYEES' },
    });
    if (!manage) {
      throw new Error('Seeded MANAGE_EMPLOYEES permission is missing.');
    }
    manageEmployeesId = manage.id;

    hashByPassword = new Map();
    tenantA = await createTenant('a');
    tenantB = await createTenant('b');
    cookieAdminA = await login(tenantA, tenantA.adminUser);
    cookieAdminB = await login(tenantB, tenantB.adminUser);
  }, 90_000);

  afterAll(async () => {
    const errors: unknown[] = [];
    const attempt = async (step: () => Promise<unknown>) => {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    };

    // Only rows of the two tenants this spec created (fixtures or API calls)
    // and of its own platform admin. Sessions first, then children before
    // parents; the length guards keep an empty id list from ever producing an
    // unfiltered deleteMany.
    const { tenantIds, userIds, platformAdminIds } = created;
    try {
      // If the provisioning authorization test regressed, the API created a
      // tenant named after this run: adopt it so it is cleaned up like the
      // fixtures (sessions, users, roles, audit rows, then the tenant).
      await attempt(async () => {
        const regressed = await admin.tenant.findMany({
          where: { name: deniedTenantName },
          select: { id: true },
        });
        tenantIds.push(...regressed.map((tenant) => tenant.id));
      });
      if (userIds.length > 0) {
        await attempt(() =>
          admin.session.deleteMany({ where: { userId: { in: userIds } } }),
        );
      }
      if (platformAdminIds.length > 0) {
        const byAdmin = { in: platformAdminIds };
        await attempt(() =>
          admin.session.deleteMany({ where: { platformAdminId: byAdmin } }),
        );
        await attempt(() =>
          admin.auditLog.deleteMany({
            where: { actorPlatformAdminId: byAdmin },
          }),
        );
      }
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
        await attempt(() =>
          admin.platformAdmin.deleteMany({
            where: { id: { in: platformAdminIds } },
          }),
        );
      }
    } finally {
      await attempt(() => admin.$disconnect());
      await attempt(() => runtime.onModuleDestroy());
      if (app) {
        await attempt(() => app.close());
      }
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  }, 90_000);

  it("lists only the caller's own tenant, in both directions", async () => {
    const employeeA = await createUser(tenantA, []);
    const employeeB = await createUser(tenantB, [tenantB.extraRoleId]);

    for (const [cookie, own, foreign] of [
      [cookieAdminA, tenantA, tenantB],
      [cookieAdminB, tenantB, tenantA],
    ] as const) {
      const response = await listEmployees(cookie);
      expect(response.status).toBe(200);
      const listed = response.body as EmployeeBody[];
      const ownSnapshot = await snapshot(own.id);
      const foreignSnapshot = await snapshot(foreign.id);

      // Exactly the caller's users: nothing missing, nothing extra.
      expect(listed.map((e) => e.id).sort()).toEqual(
        ownSnapshot.users.map((u) => u.id),
      );
      const foreignIds = new Set(foreignSnapshot.users.map((u) => u.id));
      const foreignRoleIds = new Set(foreignSnapshot.roles.map((r) => r.id));
      for (const entry of listed) {
        expect(foreignIds.has(entry.id)).toBe(false);
        for (const roleId of entry.roleIds) {
          expect(foreignRoleIds.has(roleId)).toBe(false);
        }
      }
      // The same email exists in both tenants; each list shows its own user.
      const sharedInList = listed.filter((e) => e.email === sharedEmail);
      expect(sharedInList.map((e) => e.id)).toEqual([own.adminUser.id]);
    }

    const listedA = (await listEmployees(cookieAdminA)).body as EmployeeBody[];
    const listedB = (await listEmployees(cookieAdminB)).body as EmployeeBody[];
    expect(listedA.map((e) => e.id)).toContain(employeeA.id);
    expect(listedA.map((e) => e.id)).not.toContain(employeeB.id);
    expect(listedB.map((e) => e.id)).toContain(employeeB.id);
    expect(listedB.map((e) => e.id)).not.toContain(employeeA.id);
  });

  it("answers 404 when tenant A guesses tenant B's user id on status and roles, leaving B untouched", async () => {
    const ownEmployee = await createUser(tenantA, []);
    const victim = await createUser(tenantB, [tenantB.extraRoleId]);
    const before = await snapshot(tenantB.id);

    // Positive control: the same calls on A's own employee succeed.
    const ownStatus = await patchStatus(
      cookieAdminA,
      ownEmployee.id,
      'SUSPENDED',
    );
    expect(ownStatus.status).toBe(200);
    expect(await statusOf(ownEmployee.id)).toBe('SUSPENDED');
    const ownRoles = await patchRoles(cookieAdminA, ownEmployee.id, [
      tenantA.extraRoleId,
    ]);
    expect(ownRoles.status).toBe(200);
    expect(await roleIdsOf(ownEmployee.id)).toEqual([tenantA.extraRoleId]);

    const responses = [
      await patchStatus(cookieAdminA, victim.id, 'INACTIVE'),
      await patchStatus(cookieAdminA, victim.id, 'SUSPENDED'),
      await patchRoles(cookieAdminA, victim.id, []),
      await patchRoles(cookieAdminA, victim.id, [tenantA.adminRoleId]),
      // B's own admin, the account worth attacking.
      await patchStatus(cookieAdminA, tenantB.adminUser.id, 'INACTIVE'),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(errorOf(response)).toEqual({
        code: 'RESOURCE_NOT_FOUND',
        message: expect.any(String) as string,
        fields: null,
      });
    }

    expect(await snapshot(tenantB.id)).toEqual(before);
    expect(await statusOf(victim.id)).toBe('ACTIVE');
    expect(await roleIdsOf(victim.id)).toEqual([tenantB.extraRoleId]);
    expect(await statusOf(tenantB.adminUser.id)).toBe('ACTIVE');
  });

  it("answers 404 when A assigns B's role to its own employee or creates an employee with it", async () => {
    const ownEmployee = await createUser(tenantA, [tenantA.extraRoleId]);
    const beforeA = await snapshot(tenantA.id);
    const beforeB = await snapshot(tenantB.id);

    // Positive control: A's own role is accepted on both routes.
    const okBody = newEmployeeBody(tenantA, [tenantA.extraRoleId]);
    const ok = await createEmployee(cookieAdminA, okBody);
    expect(ok.status).toBe(201);
    expect((ok.body as EmployeeBody).roleIds).toEqual([tenantA.extraRoleId]);
    const createdOk = await admin.user.findUniqueOrThrow({
      where: { id: (ok.body as EmployeeBody).id },
    });
    expect(createdOk.tenantId).toBe(tenantA.id);
    created.userIds.push(createdOk.id);
    const afterOkA = await snapshot(tenantA.id);

    const foreignBodies = [
      newEmployeeBody(tenantA, [tenantB.extraRoleId]),
      newEmployeeBody(tenantA, [tenantB.adminRoleId]),
      // One valid role does not let a foreign one ride along.
      newEmployeeBody(tenantA, [tenantA.extraRoleId, tenantB.adminRoleId]),
    ];
    const responses = [
      await patchRoles(cookieAdminA, ownEmployee.id, [tenantB.extraRoleId]),
      await patchRoles(cookieAdminA, ownEmployee.id, [tenantB.adminRoleId]),
      await patchRoles(cookieAdminA, ownEmployee.id, [
        tenantA.adminRoleId,
        tenantB.adminRoleId,
      ]),
      ...(await Promise.all(
        foreignBodies.map((body) => createEmployee(cookieAdminA, body)),
      )),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(errorOf(response)).toEqual({
        code: 'RESOURCE_NOT_FOUND',
        message: expect.any(String) as string,
        fields: null,
      });
    }

    // Nothing partial: no user created, no role link added or dropped.
    expect(await roleIdsOf(ownEmployee.id)).toEqual([tenantA.extraRoleId]);
    expect(await snapshot(tenantA.id)).toEqual(afterOkA);
    expect(afterOkA.users.length).toBe(beforeA.users.length + 1);
    for (const body of foreignBodies) {
      expect(await admin.user.count({ where: { email: body.email } })).toBe(0);
    }
    expect(await snapshot(tenantB.id)).toEqual(beforeB);
  });

  it('does not reveal whether a foreign id exists: foreign and nonexistent ids answer identically', async () => {
    const ownEmployee = await createUser(tenantA, []);
    const foreignUser = await createUser(tenantB, []);

    const foreignStatus = await patchStatus(
      cookieAdminA,
      foreignUser.id,
      'INACTIVE',
    );
    const unknownStatus = await patchStatus(
      cookieAdminA,
      randomUUID(),
      'INACTIVE',
    );
    expect(foreignStatus.status).toBe(404);
    expectIndistinguishable(foreignStatus, unknownStatus);

    const foreignUserRoles = await patchRoles(cookieAdminA, foreignUser.id, [
      tenantA.extraRoleId,
    ]);
    const unknownUserRoles = await patchRoles(cookieAdminA, randomUUID(), [
      tenantA.extraRoleId,
    ]);
    expect(foreignUserRoles.status).toBe(404);
    expectIndistinguishable(foreignUserRoles, unknownUserRoles);

    const foreignRoleOnOwn = await patchRoles(cookieAdminA, ownEmployee.id, [
      tenantB.extraRoleId,
    ]);
    const unknownRoleOnOwn = await patchRoles(cookieAdminA, ownEmployee.id, [
      randomUUID(),
    ]);
    expect(foreignRoleOnOwn.status).toBe(404);
    expectIndistinguishable(foreignRoleOnOwn, unknownRoleOnOwn);

    const foreignRoleCreate = await createEmployee(
      cookieAdminA,
      newEmployeeBody(tenantA, [tenantB.extraRoleId]),
    );
    const unknownRoleCreate = await createEmployee(
      cookieAdminA,
      newEmployeeBody(tenantA, [randomUUID()]),
    );
    expect(foreignRoleCreate.status).toBe(404);
    expectIndistinguishable(foreignRoleCreate, unknownRoleCreate);

    // The foreign user was never touched by any of this.
    expect(await statusOf(foreignUser.id)).toBe('ACTIVE');
    expect(await roleIdsOf(foreignUser.id)).toEqual([]);
  });

  it('keeps a shared email and different passwords apart: the slug picks the tenant', async () => {
    const wrongPassword = randomBytes(18).toString('base64url');

    const asA = await loginRequest(tenantA.slug, sharedEmail, tenantA.password);
    expect(asA.status).toBe(200);
    const meA = await me(sessionCookie(asA));
    expect(meA.status).toBe(200);
    expect(meA.body).toMatchObject({
      tenantId: tenantA.id,
      userId: tenantA.adminUser.id,
      email: sharedEmail,
      roles: [{ id: tenantA.adminRoleId, name: 'Administrador' }],
    });

    const asB = await loginRequest(tenantB.slug, sharedEmail, tenantB.password);
    expect(asB.status).toBe(200);
    const meB = await me(sessionCookie(asB));
    expect(meB.status).toBe(200);
    expect(meB.body).toMatchObject({
      tenantId: tenantB.id,
      userId: tenantB.adminUser.id,
      email: sharedEmail,
      roles: [{ id: tenantB.adminRoleId, name: 'Administrador' }],
    });

    // Each tenant's password only opens that tenant, in both directions.
    const aWithB = await loginRequest(
      tenantA.slug,
      sharedEmail,
      tenantB.password,
    );
    const bWithA = await loginRequest(
      tenantB.slug,
      sharedEmail,
      tenantA.password,
    );
    const aWithWrong = await loginRequest(
      tenantA.slug,
      sharedEmail,
      wrongPassword,
    );
    expect(aWithB.status).toBe(401);
    expect(errorOf(aWithB).code).toBe('INVALID_CREDENTIALS');
    expect(aWithB.headers['set-cookie']).toBeUndefined();
    expect(bWithA.status).toBe(401);
    expectIndistinguishable(aWithB, aWithWrong);
    expectIndistinguishable(bWithA, aWithWrong);
  });

  it('ignores tenant ids smuggled in a header, the query string or the body', async () => {
    const ownEmployee = await createUser(tenantA, []);
    const victim = await createUser(tenantB, [tenantB.extraRoleId]);
    const beforeB = await snapshot(tenantB.id);

    const meSpoofed = await http()
      .get('/api/auth/me')
      .query({ tenantId: tenantB.id })
      .set('x-tenant-id', tenantB.id)
      .set('x-tenant-slug', tenantB.slug)
      .set('Cookie', cookieAdminA);
    expect(meSpoofed.status).toBe(200);
    const identity = meSpoofed.body as MeBody;
    expect(identity.tenantId).toBe(tenantA.id);
    expect(identity.userId).toBe(tenantA.adminUser.id);
    // Both tenants use the same email and role name: only A's role id may
    // appear, so the profile was read in the session's tenant.
    expect(identity.email).toBe(tenantA.adminUser.email);
    expect(identity.roles).toEqual([
      { id: tenantA.adminRoleId, name: 'Administrador' },
    ]);
    expect(JSON.stringify(identity)).not.toContain(tenantB.adminRoleId);

    const listSpoofed = await http()
      .get('/api/users')
      .query({ tenantId: tenantB.id })
      .set('x-tenant-id', tenantB.id)
      .set('Cookie', cookieAdminA);
    expect(listSpoofed.status).toBe(200);
    expect(
      (listSpoofed.body as EmployeeBody[]).map((e) => e.id).sort(),
    ).toEqual((await snapshot(tenantA.id)).users.map((u) => u.id));

    const spoof = (builder: request.Test, body: Record<string, unknown>) =>
      builder
        .query({ tenantId: tenantB.id })
        .set('x-tenant-id', tenantB.id)
        .set('Cookie', cookieAdminA)
        .send({ ...body, tenantId: tenantB.id });

    const statusAttack = await spoof(
      http().patch(`/api/users/${victim.id}/status`),
      { status: 'INACTIVE' },
    );
    const rolesAttack = await spoof(
      http().patch(`/api/users/${victim.id}/roles`),
      { roleIds: [tenantB.adminRoleId] },
    );
    const createAttack = await spoof(
      http().post('/api/users'),
      newEmployeeBody(tenantA, [tenantB.extraRoleId]),
    );
    for (const response of [statusAttack, rolesAttack, createAttack]) {
      expect(response.status).toBe(404);
      expect(errorOf(response).code).toBe('RESOURCE_NOT_FOUND');
    }
    expect(await snapshot(tenantB.id)).toEqual(beforeB);

    // A stripped (not honored) body tenantId: the new employee lands in A.
    const smuggledBody = newEmployeeBody(tenantA, [tenantA.extraRoleId]);
    const createOwn = await spoof(http().post('/api/users'), smuggledBody);
    expect(createOwn.status).toBe(201);
    const createdEmployee = await admin.user.findUniqueOrThrow({
      where: { id: (createOwn.body as EmployeeBody).id },
    });
    created.userIds.push(createdEmployee.id);
    expect(createdEmployee.tenantId).toBe(tenantA.id);
    expect(await snapshot(tenantB.id)).toEqual(beforeB);

    // Positive control: the same spoofed request on A's own employee works,
    // and acts on tenant A.
    const ownAttempt = await spoof(
      http().patch(`/api/users/${ownEmployee.id}/status`),
      { status: 'INACTIVE' },
    );
    expect(ownAttempt.status).toBe(200);
    expect(await statusOf(ownEmployee.id)).toBe('INACTIVE');
    expect(await statusOf(victim.id)).toBe('ACTIVE');
  });

  it("keeps sessions per tenant: A's logout and employee deactivation never touch B's sessions", async () => {
    const sessionA2 = await login(tenantA, tenantA.adminUser);
    const employee = await createUser(tenantA, []);
    const employeeCookie = await login(tenantA, employee);
    const secondB = await login(tenantB, tenantB.adminUser);
    const activeBefore = await activeSessionCount(tenantB.id);

    // A cookie is an opaque token bound to the tenant stored with it: it
    // resolves to A's identity only, and an altered one resolves to nobody.
    const row = await admin.session.findUniqueOrThrow({
      where: { tokenHash: hashSessionToken(rawToken(sessionA2)) },
    });
    expect(row.tenantId).toBe(tenantA.id);
    expect(row.userId).toBe(tenantA.adminUser.id);
    const meA = await me(sessionA2);
    expect(meA.body).toMatchObject({ tenantId: tenantA.id });
    expect((meA.body as MeBody).tenantId).not.toBe(tenantB.id);
    const lastChar = sessionA2.endsWith('A') ? 'B' : 'A';
    const altered = await me(`${sessionA2.slice(0, -1)}${lastChar}`);
    expect(altered.status).toBe(401);

    // Logging out one A session ends only that session.
    const logout = await http()
      .post('/api/auth/logout')
      .set('Cookie', sessionA2);
    expect(logout.status).toBe(200);
    expect((await me(sessionA2)).status).toBe(401);
    expect((await me(cookieAdminA)).status).toBe(200);
    expect((await me(cookieAdminB)).status).toBe(200);
    expect((await me(secondB)).status).toBe(200);

    // Deactivating an A employee revokes that employee's sessions only.
    expect((await me(employeeCookie)).status).toBe(200);
    const deactivate = await patchStatus(cookieAdminA, employee.id, 'INACTIVE');
    expect(deactivate.status).toBe(200);
    expect((await me(employeeCookie)).status).toBe(401);
    expect((await me(cookieAdminA)).status).toBe(200);
    expect((await me(cookieAdminB)).status).toBe(200);
    expect((await me(secondB)).status).toBe(200);
    expect(await activeSessionCount(tenantB.id)).toBe(activeBefore);
  });

  it('denies tenant users on platform routes and a platform admin on tenant routes', async () => {
    const target = await createUser(tenantA, []);
    const plainEmployee = await createUser(tenantA, []);
    const employeeCookie = await login(tenantA, plainEmployee);
    const usersBefore = await snapshot(tenantA.id);

    const platformPassword = randomBytes(18).toString('base64url');
    const platformEmail = `platform-${run}@isolation-e2e.test`;
    const platformAdmin = await admin.platformAdmin.create({
      data: {
        email: platformEmail,
        passwordHash: await hashPassword(platformPassword),
      },
    });
    created.platformAdminIds.push(platformAdmin.id);
    const platformLogin = await http()
      .post('/api/platform/login')
      .send({ email: platformEmail, password: platformPassword });
    expect(platformLogin.status).toBe(200);
    const platformCookie = sessionCookie(platformLogin);
    // A platform admin's identity carries no tenant, roles or permissions.
    expect((await me(platformCookie)).body).toEqual({
      platformAdminId: platformAdmin.id,
      email: platformEmail,
    });

    const tenantRoutes = [
      await listEmployees(platformCookie),
      await createEmployee(
        platformCookie,
        newEmployeeBody(tenantA, [tenantA.extraRoleId]),
      ),
      await patchStatus(platformCookie, target.id, 'INACTIVE'),
      await patchRoles(platformCookie, target.id, [tenantA.adminRoleId]),
    ];
    for (const response of tenantRoutes) {
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe('PERMISSION_DENIED');
    }
    expect(await snapshot(tenantA.id)).toEqual(usersBefore);

    const provisionBody = {
      name: deniedTenantName,
      adminEmail: `denied-${run}@isolation-e2e.test`,
      adminPassword: randomBytes(18).toString('base64url'),
    };
    // A tenant administrator and an ordinary employee are both refused.
    for (const cookie of [cookieAdminA, employeeCookie]) {
      const provision = await http()
        .post('/api/platform/tenants')
        .set('Cookie', cookie)
        .send(provisionBody);
      expect(provision.status).toBe(403);
      expect(errorOf(provision).code).toBe('PERMISSION_DENIED');
    }
    expect(
      await admin.tenant.count({ where: { name: deniedTenantName } }),
    ).toBe(0);
  });

  it("blocks the runtime role from reading or writing another tenant's rows (RLS)", async () => {
    const ownEmployee = await createUser(tenantA, []);
    const victim = await createUser(tenantB, [tenantB.extraRoleId]);
    const beforeB = await snapshot(tenantB.id);
    const foreignUserIds = beforeB.users.map((u) => u.id);

    // Reads: tenant A's context sees A's rows only.
    const seen = await runWithTenant(runtime, tenantA.id, async (tx) => ({
      users: await tx.user.findMany(),
      roles: await tx.role.findMany(),
      userRoles: await tx.userRole.findMany(),
      foreignUser: await tx.user.findUnique({ where: { id: victim.id } }),
    }));
    expect(seen.users.length).toBeGreaterThan(0);
    expect(seen.users.every((u) => u.tenantId === tenantA.id)).toBe(true);
    expect(seen.roles.every((r) => r.tenantId === tenantA.id)).toBe(true);
    expect(seen.userRoles.every((r) => r.tenantId === tenantA.id)).toBe(true);
    expect(seen.users.map((u) => u.id)).toContain(ownEmployee.id);
    expect(seen.users.some((u) => foreignUserIds.includes(u.id))).toBe(false);
    expect(seen.foreignUser).toBeNull();

    // Writes: rows carrying B's tenantId are rejected by the policy.
    userCounter += 1;
    const forgedEmail = `forged-${userCounter}-${run}@isolation-e2e.test`;
    await expect(
      runWithTenant(runtime, tenantA.id, (tx) =>
        tx.user.create({
          data: {
            tenantId: tenantB.id,
            email: forgedEmail,
            passwordHash: 'not-a-real-hash',
          },
        }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
    await expect(
      runWithTenant(runtime, tenantA.id, (tx) =>
        tx.userRole.create({
          data: {
            tenantId: tenantB.id,
            userId: victim.id,
            roleId: tenantB.adminRoleId,
          },
        }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
    // A's own tenantId but B's role: the composite foreign key refuses it.
    await expect(
      runWithTenant(runtime, tenantA.id, (tx) =>
        tx.userRole.create({
          data: {
            tenantId: tenantA.id,
            userId: ownEmployee.id,
            roleId: tenantB.adminRoleId,
          },
        }),
      ),
    ).rejects.toThrow(FOREIGN_KEY_VIOLATION);

    // Updates and deletes silently match nothing across tenants.
    const updated = await runWithTenant(runtime, tenantA.id, (tx) =>
      tx.user.updateMany({
        where: { id: victim.id },
        data: { status: 'INACTIVE' },
      }),
    );
    expect(updated.count).toBe(0);
    const removed = await runWithTenant(runtime, tenantA.id, (tx) =>
      tx.userRole.deleteMany({ where: { userId: victim.id } }),
    );
    expect(removed.count).toBe(0);

    expect(await admin.user.count({ where: { email: forgedEmail } })).toBe(0);
    expect(await roleIdsOf(ownEmployee.id)).toEqual([]);
    expect(await snapshot(tenantB.id)).toEqual(beforeB);

    // Positive control: the same insert with A's own tenantId is accepted.
    userCounter += 1;
    const ownEmail = `own-${userCounter}-${run}@isolation-e2e.test`;
    const inserted = await runWithTenant(runtime, tenantA.id, (tx) =>
      tx.user.create({
        data: {
          tenantId: tenantA.id,
          email: ownEmail,
          passwordHash: 'not-a-real-hash',
        },
      }),
    );
    created.userIds.push(inserted.id);
    expect(await admin.user.count({ where: { email: ownEmail } })).toBe(1);
  });
});
