import { randomBytes, randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import { UserManagementRepository } from '../src/modules/users/domain/user-management.repository';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';
import {
  PrismaUserManagementRepository,
  employeeAdministrationLockKey,
} from '../src/modules/users/infrastructure/prisma-user-management.repository';

const COOKIE_NAME = 'sls_session';

// Lock waits of the apps built below. The race and demoted-caller scenarios
// expect a 403/409 after queueing on the lock, so on a slow machine they must
// not time out into a 503; the busy scenario wants a short wait on purpose.
const PATIENT_LOCK_TIMEOUT_MS = 15_000;
const IMPATIENT_LOCK_TIMEOUT_MS = 500;

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

interface TenantFixture {
  id: string;
  slug: string;
  adminRoleId: string;
  altAdminRoleId: string;
  courierRoleId: string;
}

interface UserFixture {
  id: string;
  email: string;
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

function fieldNames(response: request.Response): string[] {
  return [
    ...new Set((errorOf(response).fields ?? []).map((f) => f.field)),
  ].sort();
}

describe('Employee management /api/v1/users (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  // Random per run and never logged: slugs, emails and the shared password.
  const run = randomUUID().slice(0, 8);
  const password = randomBytes(18).toString('base64url');
  let passwordHash: string;
  let manageEmployeesId: string;
  let operateDeliveriesId: string;
  let userCounter = 0;
  const created = {
    tenantIds: [] as string[],
    platformAdminIds: [] as string[],
  };

  function http(target: INestApplication = app) {
    return request(target.getHttpServer());
  }

  async function createApp(lockTimeoutMs: number): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UserManagementRepository)
      .useFactory({
        factory: (prisma: PrismaService) =>
          new PrismaUserManagementRepository(prisma, lockTimeoutMs),
        inject: [PrismaService],
      })
      .compile();
    const instance = moduleFixture.createNestApplication();
    configureApp(instance);
    await instance.init();
    return instance;
  }

  function expectNoSecrets(response: request.Response): void {
    expect(response.text).not.toContain('$argon2');
    expect(response.text).not.toContain('passwordHash');
    expect(response.text).not.toContain(password);
  }

  async function createTenant(label: string): Promise<TenantFixture> {
    const slug = `users-e2e-${label}-${run}`;
    const tenant = await admin.tenant.create({
      data: { name: `Users E2E ${label} ${run}`, slug },
    });
    created.tenantIds.push(tenant.id);

    const role = async (name: string, permissionId: string) => {
      const row = await admin.role.create({
        data: { tenantId: tenant.id, name },
      });
      await admin.rolePermission.create({
        data: { tenantId: tenant.id, roleId: row.id, permissionId },
      });
      return row.id;
    };

    return {
      id: tenant.id,
      slug,
      adminRoleId: await role('Administrador', manageEmployeesId),
      altAdminRoleId: await role('Jefe de personal', manageEmployeesId),
      courierRoleId: await role('Mensajero', operateDeliveriesId),
    };
  }

  async function createUser(
    tenant: TenantFixture,
    roleIds: string[],
    label = 'user',
  ): Promise<UserFixture> {
    userCounter += 1;
    const email = `${label}-${userCounter}-${run}@users-e2e.test`;
    const user = await admin.user.create({
      data: { tenantId: tenant.id, email, passwordHash },
    });
    if (roleIds.length > 0) {
      await admin.userRole.createMany({
        data: roleIds.map((roleId) => ({
          tenantId: tenant.id,
          userId: user.id,
          roleId,
        })),
      });
    }
    return { id: user.id, email };
  }

  function loginRequest(tenant: TenantFixture, email: string) {
    return http()
      .post('/api/v1/auth/login')
      .send({ slug: tenant.slug, email, password });
  }

  async function login(
    tenant: TenantFixture,
    user: UserFixture,
  ): Promise<string> {
    const response = await loginRequest(tenant, user.email);
    expect(response.status).toBe(200);
    return sessionCookie(response);
  }

  function createEmployee(cookie: string, body: Record<string, unknown>) {
    return http().post('/api/v1/users').set('Cookie', cookie).send(body);
  }

  function listEmployees(cookie: string) {
    return http().get('/api/v1/users').set('Cookie', cookie);
  }

  function patchStatus(
    cookie: string,
    id: string,
    status: unknown,
    target: INestApplication = app,
  ) {
    return http(target)
      .patch(`/api/v1/users/${id}/status`)
      .set('Cookie', cookie)
      .send({ status });
  }

  function patchRoles(cookie: string, id: string, roleIds: unknown) {
    return http()
      .patch(`/api/v1/users/${id}/roles`)
      .set('Cookie', cookie)
      .send({ roleIds });
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

  async function userIdsOf(tenantId: string): Promise<string[]> {
    const rows = await admin.user.findMany({
      where: { tenantId },
      select: { id: true },
    });
    return rows.map((row) => row.id).sort();
  }

  // Counts only the transactions blocked on THIS tenant's employee lock.
  // pg_advisory_xact_lock(bigint) stores the 64-bit key as classid (high 32
  // bits) and objid (low 32 bits) with objsubid = 1, so concurrent Jest
  // workers, migrations or other tenants' locks cannot satisfy the wait.
  async function waitForAdvisoryLockWaiters(
    tenantId: string,
    expected: number,
  ): Promise<void> {
    const lockKey = employeeAdministrationLockKey(tenantId);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const rows = await admin.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS waiting FROM pg_locks
        WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
          AND classid::bigint = (hashtext(${lockKey}::text)::bigint >> 32) & 4294967295
          AND objid::bigint = hashtext(${lockKey}::text)::bigint & 4294967295`;
      if (rows[0].waiting >= expected) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`no ${expected} request(s) waiting on the lock`);
  }

  beforeAll(async () => {
    await admin.$connect();

    app = await createApp(PATIENT_LOCK_TIMEOUT_MS);

    passwordHash = await hashPassword(password);
    // Seeded, global rows: read by code, never created or deleted here.
    const permissions = await admin.permission.findMany({
      where: { code: { in: ['MANAGE_EMPLOYEES', 'OPERATE_DELIVERIES'] } },
    });
    const manage = permissions.find((p) => p.code === 'MANAGE_EMPLOYEES');
    const operate = permissions.find((p) => p.code === 'OPERATE_DELIVERIES');
    if (!manage || !operate) {
      throw new Error('Seeded MANAGE_EMPLOYEES/OPERATE_DELIVERIES missing.');
    }
    manageEmployeesId = manage.id;
    operateDeliveriesId = operate.id;
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

    // Every row inside these tenants was created by this spec (fixtures or
    // API calls). Sessions first, then children before parents. The length
    // guards keep an empty id list from producing an unfiltered deleteMany.
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

  it('creates an employee with a normalized email and lists only the caller tenant', async () => {
    const tenant = await createTenant('create');
    const owner = await createUser(tenant, [tenant.adminRoleId], 'owner');
    const other = await createTenant('create-other');
    const outsider = await createUser(other, [other.adminRoleId], 'outsider');
    const cookie = await login(tenant, owner);
    const email = `new-${run}@users-e2e.test`;

    const created201 = await createEmployee(cookie, {
      email: email.toUpperCase(),
      password,
      roleIds: [tenant.courierRoleId],
      // Not part of the contract: the tenant comes only from the session.
      tenantId: other.id,
    });

    expect(created201.status).toBe(201);
    expectNoSecrets(created201);
    const employee = created201.body as EmployeeBody;
    expect(Object.keys(employee).sort()).toEqual([
      'email',
      'id',
      'roleIds',
      'status',
    ]);
    expect(employee).toMatchObject({
      email,
      status: 'ACTIVE',
      roleIds: [tenant.courierRoleId],
    });
    const stored = await admin.user.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(stored.tenantId).toBe(tenant.id);

    const list = await listEmployees(cookie);
    expect(list.status).toBe(200);
    expectNoSecrets(list);
    const listed = list.body as EmployeeBody[];
    expect(listed.map((e) => e.id).sort()).toEqual(await userIdsOf(tenant.id));
    expect(listed.map((e) => e.id)).not.toContain(outsider.id);
    expect(listed.find((e) => e.id === employee.id)).toEqual(employee);
    for (const entry of listed) {
      expect(Object.keys(entry).sort()).toEqual([
        'email',
        'id',
        'roleIds',
        'status',
      ]);
    }

    const employeeLogin = await loginRequest(tenant, email);
    expect(employeeLogin.status).toBe(200);
  });

  it('answers 403 PERMISSION_DENIED on every endpoint to an employee without MANAGE_EMPLOYEES', async () => {
    const tenant = await createTenant('courier');
    const owner = await createUser(tenant, [tenant.adminRoleId], 'owner');
    const courier = await createUser(tenant, [tenant.courierRoleId], 'courier');
    const cookie = await login(tenant, courier);
    const usersBefore = await userIdsOf(tenant.id);

    const responses = [
      await createEmployee(cookie, {
        email: `escalate-${run}@users-e2e.test`,
        password,
        roleIds: [tenant.adminRoleId],
      }),
      // Authorization comes before validation: an invalid body is still 403.
      await createEmployee(cookie, {}),
      await listEmployees(cookie),
      await patchStatus(cookie, owner.id, 'INACTIVE'),
      // Self-escalation attempt.
      await patchRoles(cookie, courier.id, [tenant.adminRoleId]),
      await patchRoles(cookie, 'not-a-uuid', 'nope'),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(errorOf(response)).toEqual({
        code: 'PERMISSION_DENIED',
        message: expect.any(String) as string,
        fields: null,
      });
    }
    expect(await roleIdsOf(courier.id)).toEqual([tenant.courierRoleId]);
    expect(await statusOf(owner.id)).toBe('ACTIVE');
    expect(await userIdsOf(tenant.id)).toEqual(usersBefore);
  });

  it('answers 403 PERMISSION_DENIED to a platform admin and 401 without a session', async () => {
    const tenant = await createTenant('platform');
    const target = await createUser(tenant, [tenant.courierRoleId], 'target');
    const platformEmail = `platform-${run}@users-e2e.test`;
    const platformAdmin = await admin.platformAdmin.create({
      data: { email: platformEmail, passwordHash },
    });
    created.platformAdminIds.push(platformAdmin.id);
    const platformLogin = await http()
      .post('/api/v1/platform/login')
      .send({ email: platformEmail, password });
    expect(platformLogin.status).toBe(200);
    const cookie = sessionCookie(platformLogin);

    const responses = [
      await createEmployee(cookie, {
        email: `platform-made-${run}@users-e2e.test`,
        password,
        roleIds: [tenant.courierRoleId],
      }),
      await listEmployees(cookie),
      await patchStatus(cookie, target.id, 'INACTIVE'),
      await patchRoles(cookie, target.id, []),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(errorOf(response).code).toBe('PERMISSION_DENIED');
    }
    expect(await statusOf(target.id)).toBe('ACTIVE');
    expect(await roleIdsOf(target.id)).toEqual([tenant.courierRoleId]);

    const anonymous = await http().get('/api/v1/users');
    expect(anonymous.status).toBe(401);
    expect(errorOf(anonymous).code).toBe('SESSION_EXPIRED');
  });

  it("keeps tenant B's admin away from tenant A's employees and roles (404, nothing changed)", async () => {
    const tenantA = await createTenant('iso-a');
    await createUser(tenantA, [tenantA.adminRoleId], 'owner-a');
    const employeeA = await createUser(
      tenantA,
      [tenantA.courierRoleId],
      'employee-a',
    );
    const tenantB = await createTenant('iso-b');
    const ownerB = await createUser(tenantB, [tenantB.adminRoleId], 'owner-b');
    const employeeB = await createUser(
      tenantB,
      [tenantB.courierRoleId],
      'employee-b',
    );
    const cookieB = await login(tenantB, ownerB);

    const list = await listEmployees(cookieB);
    expect(list.status).toBe(200);
    expect((list.body as EmployeeBody[]).map((e) => e.id).sort()).toEqual(
      await userIdsOf(tenantB.id),
    );

    const notFound = [
      await patchStatus(cookieB, employeeA.id, 'SUSPENDED'),
      await patchRoles(cookieB, employeeA.id, [tenantB.courierRoleId]),
      // A role of tenant A, assigned to tenant B's own employee.
      await patchRoles(cookieB, employeeB.id, [tenantA.adminRoleId]),
      await createEmployee(cookieB, {
        email: `foreign-role-${run}@users-e2e.test`,
        password,
        roleIds: [tenantA.courierRoleId],
      }),
    ];
    for (const response of notFound) {
      expect(response.status).toBe(404);
      expect(errorOf(response)).toEqual({
        code: 'RESOURCE_NOT_FOUND',
        message: expect.any(String) as string,
        fields: null,
      });
    }

    expect(await statusOf(employeeA.id)).toBe('ACTIVE');
    expect(await roleIdsOf(employeeA.id)).toEqual([tenantA.courierRoleId]);
    expect(await roleIdsOf(employeeB.id)).toEqual([tenantB.courierRoleId]);
    expect(
      await admin.user.count({
        where: { email: `foreign-role-${run}@users-e2e.test` },
      }),
    ).toBe(0);

    const unknown = await patchStatus(cookieB, randomUUID(), 'INACTIVE');
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).code).toBe('RESOURCE_NOT_FOUND');
  });

  it('refuses to remove MANAGE_EMPLOYEES from the last active admin, via status or roles', async () => {
    const tenant = await createTenant('last');
    const owner = await createUser(tenant, [tenant.adminRoleId], 'owner');
    await createUser(tenant, [tenant.courierRoleId], 'courier');
    const cookie = await login(tenant, owner);

    const conflicts = [
      await patchStatus(cookie, owner.id, 'INACTIVE'),
      await patchStatus(cookie, owner.id, 'SUSPENDED'),
      await patchRoles(cookie, owner.id, [tenant.courierRoleId]),
      await patchRoles(cookie, owner.id, []),
    ];
    for (const response of conflicts) {
      expect(response.status).toBe(409);
      expect(errorOf(response)).toEqual({
        code: 'LAST_ADMIN_CANNOT_BE_REMOVED',
        message: expect.any(String) as string,
        fields: null,
      });
    }
    expect(await statusOf(owner.id)).toBe('ACTIVE');
    expect(await roleIdsOf(owner.id)).toEqual([tenant.adminRoleId]);

    // Moving to another role that also grants the permission is allowed.
    const swap = await patchRoles(cookie, owner.id, [tenant.altAdminRoleId]);
    expect(swap.status).toBe(200);
    expect(swap.body).toEqual({ ok: true });
    expect(await roleIdsOf(owner.id)).toEqual([tenant.altAdminRoleId]);
    expect((await listEmployees(cookie)).status).toBe(200);
  });

  it('deactivates one of two admins, revoking its sessions, then protects the remaining one', async () => {
    const tenant = await createTenant('two');
    const first = await createUser(tenant, [tenant.adminRoleId], 'first');
    const second = await createUser(tenant, [tenant.altAdminRoleId], 'second');
    const firstCookie = await login(tenant, first);
    const secondCookie = await login(tenant, second);
    const meBefore = await http()
      .get('/api/v1/auth/me')
      .set('Cookie', secondCookie);
    expect(meBefore.status).toBe(200);
    expect(meBefore.body).toEqual({
      userId: second.id,
      tenantId: tenant.id,
      email: second.email,
      roles: [{ id: tenant.altAdminRoleId, name: 'Jefe de personal' }],
      permissions: ['MANAGE_EMPLOYEES'],
    });

    const deactivate = await patchStatus(firstCookie, second.id, 'INACTIVE');
    expect(deactivate.status).toBe(200);
    expect(deactivate.body).toEqual({ ok: true });
    expect(await statusOf(second.id)).toBe('INACTIVE');

    const me = await http().get('/api/v1/auth/me').set('Cookie', secondCookie);
    expect(me.status).toBe(401);
    expect(
      await admin.session.count({
        where: { userId: second.id, revokedAt: null },
      }),
    ).toBe(0);
    const relogin = await loginRequest(tenant, second.email);
    expect(relogin.status).toBe(401);
    expect(errorOf(relogin).code).toBe('INVALID_CREDENTIALS');

    const self = await patchStatus(firstCookie, first.id, 'INACTIVE');
    expect(self.status).toBe(409);
    expect(errorOf(self).code).toBe('LAST_ADMIN_CANNOT_BE_REMOVED');
    expect(await statusOf(first.id)).toBe('ACTIVE');

    const reactivate = await patchStatus(firstCookie, second.id, 'ACTIVE');
    expect(reactivate.status).toBe(200);
    expect((await loginRequest(tenant, second.email)).status).toBe(200);
  });

  // The spec holds the tenant's employee-administration lock while the
  // requests start, so they all pass authentication and then queue on the
  // lock before any reads the admin count. Releasing it lets them race for
  // real; only serialization inside the use case keeps one admin.
  async function raceOnLock(
    tenant: TenantFixture,
    start: () => Promise<request.Response>[],
  ): Promise<request.Response[]> {
    let pending: Promise<request.Response[]> | undefined;
    await admin.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeAdministrationLockKey(tenant.id)}::text))`;
        const requests = start();
        pending = Promise.all(requests);
        await waitForAdvisoryLockWaiters(tenant.id, requests.length);
      },
      { timeout: 20_000 },
    );
    if (!pending) {
      throw new Error('the concurrent requests were not started');
    }
    return pending;
  }

  it('lets exactly one of the last two admins deactivate itself when both try at once', async () => {
    const tenant = await createTenant('race');
    const x = await createUser(tenant, [tenant.adminRoleId], 'x');
    const y = await createUser(tenant, [tenant.adminRoleId], 'y');
    const xCookie = await login(tenant, x);
    const yCookie = await login(tenant, y);

    const responses = await raceOnLock(tenant, () => [
      patchStatus(xCookie, x.id, 'INACTIVE'),
      patchStatus(yCookie, y.id, 'INACTIVE'),
    ]);

    // The second to run is still an admin, but would leave none: 409.
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((r) => r.status === 409);
    expect(conflict && errorOf(conflict).code).toBe(
      'LAST_ADMIN_CANNOT_BE_REMOVED',
    );
    const statuses = [await statusOf(x.id), await statusOf(y.id)].sort();
    expect(statuses).toEqual(['ACTIVE', 'INACTIVE']);
  });

  it('lets exactly one of two crossed deactivations of the last two admins succeed', async () => {
    const tenant = await createTenant('race-cross');
    const x = await createUser(tenant, [tenant.adminRoleId], 'x');
    const y = await createUser(tenant, [tenant.adminRoleId], 'y');
    const xCookie = await login(tenant, x);
    const yCookie = await login(tenant, y);

    const responses = await raceOnLock(tenant, () => [
      patchStatus(xCookie, y.id, 'INACTIVE'),
      patchStatus(yCookie, x.id, 'INACTIVE'),
    ]);

    // The loser's caller was deactivated by the winner while it waited, so
    // the re-check inside the lock refuses it (403) before the last-admin
    // rule is evaluated. Either way exactly one admin remains.
    expect(responses.map((r) => r.status).sort()).toEqual([200, 403]);
    const denied = responses.find((r) => r.status === 403);
    expect(denied && errorOf(denied)).toEqual({
      code: 'PERMISSION_DENIED',
      message: expect.any(String) as string,
      fields: null,
    });
    const statuses = [await statusOf(x.id), await statusOf(y.id)].sort();
    expect(statuses).toEqual(['ACTIVE', 'INACTIVE']);
  });

  it('refuses with 403 a status, roles or create request whose caller lost MANAGE_EMPLOYEES while it waited on the lock', async () => {
    const tenant = await createTenant('demoted');
    const caller = await createUser(tenant, [tenant.adminRoleId], 'caller');
    await createUser(tenant, [tenant.altAdminRoleId], 'other-admin');
    const courier = await createUser(tenant, [tenant.courierRoleId], 'target');
    const cookie = await login(tenant, caller);
    const lateEmail = `late-${run}@users-e2e.test`;

    const scenarios: [string, () => Promise<request.Response>][] = [
      ['status', () => patchStatus(cookie, courier.id, 'SUSPENDED')],
      ['roles', () => patchRoles(cookie, courier.id, [tenant.adminRoleId])],
      [
        'create',
        () =>
          createEmployee(cookie, {
            email: lateEmail,
            password,
            roleIds: [tenant.adminRoleId],
          }),
      ],
    ];

    for (const [label, send] of scenarios) {
      // Restore the caller as admin: each request must pass the guard.
      await admin.userRole.deleteMany({ where: { userId: caller.id } });
      await admin.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: caller.id,
          roleId: tenant.adminRoleId,
        },
      });

      let pending: Promise<request.Response> | undefined;
      // The spec holds the lock (as another administration would), lets the
      // request pass the guard and queue, then demotes the caller in that
      // same transaction before releasing the lock.
      await admin.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeAdministrationLockKey(tenant.id)}::text))`;
          // supertest only dispatches once .then() is called.
          pending = send().then((response) => response);
          await waitForAdvisoryLockWaiters(tenant.id, 1);
          await tx.userRole.deleteMany({ where: { userId: caller.id } });
          await tx.userRole.create({
            data: {
              tenantId: tenant.id,
              userId: caller.id,
              roleId: tenant.courierRoleId,
            },
          });
        },
        { timeout: 20_000 },
      );
      if (!pending) {
        throw new Error(`the ${label} request was not started`);
      }
      const response = await pending;

      expect({ label, status: response.status }).toEqual({
        label,
        status: 403,
      });
      expect(errorOf(response)).toEqual({
        code: 'PERMISSION_DENIED',
        message: expect.any(String) as string,
        fields: null,
      });
    }

    expect(await statusOf(courier.id)).toBe('ACTIVE');
    expect(await roleIdsOf(courier.id)).toEqual([tenant.courierRoleId]);
    expect(await admin.user.count({ where: { email: lateEmail } })).toBe(0);
  });

  it('answers 503 SERVICE_BUSY, changing nothing, when the lock stays held past the bounded wait', async () => {
    const tenant = await createTenant('busy');
    const owner = await createUser(tenant, [tenant.adminRoleId], 'owner');
    const courier = await createUser(tenant, [tenant.courierRoleId], 'target');
    const cookie = await login(tenant, owner);
    let response: request.Response | undefined;

    // A second app with a short lock wait: the spec holds the lock for the
    // whole request, so that wait expires while it still owns the lock.
    const impatientApp = await createApp(IMPATIENT_LOCK_TIMEOUT_MS);
    try {
      await admin.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeAdministrationLockKey(tenant.id)}::text))`;
          response = await patchStatus(
            cookie,
            courier.id,
            'SUSPENDED',
            impatientApp,
          );
        },
        { timeout: 20_000 },
      );
    } finally {
      await impatientApp.close();
    }

    expect(response?.status).toBe(503);
    expect(response && errorOf(response)).toEqual({
      code: 'SERVICE_BUSY',
      message: 'Intenta de nuevo en unos segundos.',
      fields: null,
    });
    expect(await statusOf(courier.id)).toBe('ACTIVE');
    expect(
      await admin.session.count({
        where: { userId: courier.id, revokedAt: { not: null } },
      }),
    ).toBe(0);

    // Once the lock is free the same request succeeds.
    const retry = await patchStatus(cookie, courier.id, 'SUSPENDED');
    expect(retry.status).toBe(200);
    expect(await statusOf(courier.id)).toBe('SUSPENDED');
  });

  it('answers 409 EMAIL_ALREADY_EXISTS for a duplicate email in the tenant, but not across tenants', async () => {
    const tenant = await createTenant('dup');
    const owner = await createUser(tenant, [tenant.adminRoleId], 'owner');
    const existing = await createUser(tenant, [tenant.courierRoleId], 'taken');
    const other = await createTenant('dup-other');
    const otherOwner = await createUser(other, [other.adminRoleId], 'owner');

    const duplicate = await createEmployee(await login(tenant, owner), {
      email: existing.email.toUpperCase(),
      password,
      roleIds: [tenant.courierRoleId],
    });
    expect(duplicate.status).toBe(409);
    expect(errorOf(duplicate)).toEqual({
      code: 'EMAIL_ALREADY_EXISTS',
      message: expect.any(String) as string,
      fields: null,
    });
    expect(
      await admin.user.count({
        where: { tenantId: tenant.id, email: existing.email },
      }),
    ).toBe(1);

    const elsewhere = await createEmployee(await login(other, otherOwner), {
      email: existing.email,
      password,
      roleIds: [other.courierRoleId],
    });
    expect(elsewhere.status).toBe(201);
    expectNoSecrets(elsewhere);
  });

  it('rejects invalid bodies and ids with 400 VALIDATION_ERROR and a fields list', async () => {
    const tenant = await createTenant('invalid');
    const owner = await createUser(tenant, [tenant.adminRoleId], 'owner');
    const cookie = await login(tenant, owner);
    const usersBefore = await userIdsOf(tenant.id);
    const role = tenant.courierRoleId;

    const cases: [request.Response, string[]][] = [
      [await createEmployee(cookie, {}), ['email', 'password', 'roleIds']],
      [
        await createEmployee(cookie, {
          email: 'not-an-email',
          password: 'short',
          roleIds: [],
        }),
        ['email', 'password', 'roleIds'],
      ],
      [
        await createEmployee(cookie, {
          email: `big-${run}@users-e2e.test`,
          password: 'x'.repeat(1025),
          roleIds: ['not-a-uuid'],
        }),
        ['password', 'roleIds'],
      ],
      [
        await createEmployee(cookie, {
          email: `dupe-role-${run}@users-e2e.test`,
          password,
          roleIds: [role, role.toUpperCase()],
        }),
        ['roleIds'],
      ],
      [
        await createEmployee(cookie, {
          email: `many-roles-${run}@users-e2e.test`,
          password,
          roleIds: Array.from({ length: 21 }, () => randomUUID()),
        }),
        ['roleIds'],
      ],
      [await patchStatus(cookie, owner.id, 'DELETED'), ['status']],
      [await patchRoles(cookie, owner.id, 'not-an-array'), ['roleIds']],
      [await patchStatus(cookie, 'not-a-uuid', 'INACTIVE'), ['id']],
      [await patchRoles(cookie, 'not-a-uuid', [role]), ['id']],
    ];

    for (const [response, fields] of cases) {
      expect(response.status).toBe(400);
      expect(errorOf(response).code).toBe('VALIDATION_ERROR');
      expect(fieldNames(response)).toEqual(fields);
      expectNoSecrets(response);
    }
    expect(await userIdsOf(tenant.id)).toEqual(usersBefore);
    expect(await statusOf(owner.id)).toBe('ACTIVE');
  });

  it('lists tenant assignable roles at GET /api/v1/users/roles and records atomic AuditLog entries on employee mutations', async () => {
    const tenant = await createTenant('roles-and-audit');
    const other = await createTenant('roles-and-audit-other');
    const owner = await createUser(tenant, [tenant.adminRoleId], 'owner');
    const cookie = await login(tenant, owner);

    const rolesResponse = await http()
      .get('/api/v1/users/roles')
      .set('Cookie', cookie);

    expect(rolesResponse.status).toBe(200);
    const roles = rolesResponse.body as {
      id: string;
      name: string;
      permissions: string[];
    }[];
    expect(roles.map((r) => r.id).sort()).toEqual(
      [tenant.adminRoleId, tenant.altAdminRoleId, tenant.courierRoleId].sort(),
    );
    expect(roles.some((r) => r.id === other.adminRoleId)).toBe(false);

    const createdRes = await createEmployee(cookie, {
      email: `audited-${run}@users-e2e.test`,
      password,
      roleIds: [tenant.courierRoleId],
    });
    expect(createdRes.status).toBe(201);
    const createdEmployee = createdRes.body as EmployeeBody;

    const rolesPatchRes = await patchRoles(cookie, createdEmployee.id, [
      tenant.altAdminRoleId,
    ]);
    expect(rolesPatchRes.status).toBe(200);

    const statusPatchRes = await patchStatus(
      cookie,
      createdEmployee.id,
      'SUSPENDED',
    );
    expect(statusPatchRes.status).toBe(200);

    const auditRows = await admin.auditLog.findMany({
      where: { tenantId: tenant.id, entityId: createdEmployee.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(auditRows.map((row) => row.action)).toEqual([
      'EMPLOYEE_CREATED',
      'EMPLOYEE_ROLES_UPDATED',
      'EMPLOYEE_STATUS_UPDATED',
    ]);
    for (const row of auditRows) {
      expect(row.actorUserId).toBe(owner.id);
      expect(row.entityType).toBe('User');
      expect(JSON.stringify(row.metadata)).not.toContain(password);
      expect(JSON.stringify(row.metadata)).not.toContain('$argon2');
    }
  });
});
