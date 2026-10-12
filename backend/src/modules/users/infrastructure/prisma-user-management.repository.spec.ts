import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  EMPLOYEE_ADMIN_LOCK_TIMEOUT_MS,
  PrismaUserManagementRepository,
  employeeAdministrationLockKey,
} from './prisma-user-management.repository';
import {
  EmployeeAdministrationBusyError,
  EmployeeEmailAlreadyExistsError,
  MANAGE_EMPLOYEES,
} from '../domain/employee';

// Runs against the real database: what is under test is the SQL itself (RLS
// on User/Role/UserRole/RolePermission, the unique index, the advisory lock).
// Fixtures go through the admin connection (DATABASE_URL); the repository uses
// the runtime role (PrismaService). Permission rows are seeded and global: the
// spec only reads them by code and never creates or deletes them.
describe('PrismaUserManagementRepository', () => {
  jest.setTimeout(30000);

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const prisma = new PrismaService();
  const repository = new PrismaUserManagementRepository(prisma);
  const runId = randomUUID().slice(0, 8);
  // Only ids actually created here are ever used in cleanup filters.
  const createdTenantIds: string[] = [];

  let tenantA: string;
  let tenantB: string;
  let adminRoleA: string;
  let secondAdminRoleA: string;
  let courierRoleA: string;
  let adminRoleB: string;
  let adminUserA: string;
  let inactiveAdminA: string;
  let courierA: string;
  let userB: string;

  async function createTenant(label: string): Promise<string> {
    const tenant = await admin.tenant.create({
      data: {
        name: `users-repo-${label}-${runId}`,
        slug: `users-repo-${label}-${runId}`,
      },
    });
    createdTenantIds.push(tenant.id);
    return tenant.id;
  }

  async function createRole(
    tenantId: string,
    name: string,
    permissionIds: string[],
  ): Promise<string> {
    const role = await admin.role.create({ data: { tenantId, name } });
    if (permissionIds.length > 0) {
      await admin.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          tenantId,
          roleId: role.id,
          permissionId,
        })),
      });
    }
    return role.id;
  }

  async function createUser(
    tenantId: string,
    email: string,
    roleIds: string[],
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ): Promise<string> {
    const user = await admin.user.create({
      data: { tenantId, email, passwordHash: 'not-a-real-hash', status },
    });
    if (roleIds.length > 0) {
      await admin.userRole.createMany({
        data: roleIds.map((roleId) => ({ tenantId, userId: user.id, roleId })),
      });
    }
    return user.id;
  }

  async function roleIdsOf(userId: string): Promise<string[]> {
    const rows = await admin.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    return rows.map((row) => row.roleId).sort();
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
    const deadline = Date.now() + 10000;
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
    throw new Error(`no ${expected} transaction(s) waiting on the lock`);
  }

  beforeAll(async () => {
    for (const name of ['DATABASE_URL', 'RUNTIME_DATABASE_URL']) {
      if (!process.env[name]) {
        throw new Error(
          `${name} is not set. Run this spec through ` +
            '`docker compose exec backend npm test` so both URLs exist.',
        );
      }
    }

    await admin.$connect();
    await prisma.onModuleInit();

    const permissions = await admin.permission.findMany({
      where: { code: { in: [MANAGE_EMPLOYEES, 'OPERATE_DELIVERIES'] } },
    });
    const manage = permissions.find((p) => p.code === MANAGE_EMPLOYEES);
    const operate = permissions.find((p) => p.code === 'OPERATE_DELIVERIES');
    if (!manage || !operate) {
      throw new Error('Seeded MANAGE_EMPLOYEES/OPERATE_DELIVERIES missing.');
    }

    tenantA = await createTenant('a');
    tenantB = await createTenant('b');
    adminRoleA = await createRole(tenantA, 'Admin', [manage.id]);
    secondAdminRoleA = await createRole(tenantA, 'Admin 2', [manage.id]);
    courierRoleA = await createRole(tenantA, 'Courier', [operate.id]);
    adminRoleB = await createRole(tenantB, 'Admin', [manage.id]);

    // Two roles granting the permission: still one admin when counted.
    adminUserA = await createUser(tenantA, `admin-${runId}@a.test`, [
      adminRoleA,
      secondAdminRoleA,
    ]);
    inactiveAdminA = await createUser(
      tenantA,
      `inactive-${runId}@a.test`,
      [adminRoleA],
      'INACTIVE',
    );
    courierA = await createUser(tenantA, `courier-${runId}@a.test`, [
      courierRoleA,
    ]);
    userB = await createUser(tenantB, `admin-${runId}@a.test`, [adminRoleB]);
  }, 30000);

  afterAll(async () => {
    const failures: unknown[] = [];
    const step = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        failures.push(error);
      }
    };

    // Every row in these tenants was created by this spec (directly or
    // through the repository). The length guard keeps an empty list from
    // ever producing an unfiltered deleteMany.
    if (createdTenantIds.length > 0) {
      const byTenant = { where: { tenantId: { in: createdTenantIds } } };
      await step(() => admin.session.deleteMany(byTenant));
      await step(() => admin.auditLog.deleteMany(byTenant));
      await step(() => admin.userRole.deleteMany(byTenant));
      await step(() => admin.rolePermission.deleteMany(byTenant));
      await step(() => admin.role.deleteMany(byTenant));
      await step(() => admin.user.deleteMany(byTenant));
      await step(() =>
        admin.tenant.deleteMany({ where: { id: { in: createdTenantIds } } }),
      );
    }
    await step(() => admin.$disconnect());
    await step(() => prisma.onModuleDestroy());

    if (failures.length > 0) {
      throw failures[0];
    }
  }, 30000);

  describe('list', () => {
    it('returns exactly the users of the tenant with their role ids and no credentials', async () => {
      const employees = await repository.list(tenantA);
      const expected = await admin.user.findMany({
        where: { tenantId: tenantA },
        select: { id: true },
      });

      expect(employees.map((e) => e.id).sort()).toEqual(
        expected.map((u) => u.id).sort(),
      );
      expect(employees.map((e) => e.id)).not.toContain(userB);
      for (const employee of employees) {
        expect(Object.keys(employee).sort()).toEqual([
          'email',
          'id',
          'roleIds',
          'status',
        ]);
      }
      const adminRecord = employees.find((e) => e.id === adminUserA);
      expect([...(adminRecord?.roleIds ?? [])].sort()).toEqual(
        [adminRoleA, secondAdminRoleA].sort(),
      );
      expect(employees.find((e) => e.id === inactiveAdminA)?.status).toBe(
        'INACTIVE',
      );
    });
  });

  describe('transaction-bound reads', () => {
    it('reports the permission only for ACTIVE holders of this tenant', async () => {
      const result = await repository.runExclusive(tenantA, async (tx) => ({
        admin: await tx.userHasPermission(adminUserA, MANAGE_EMPLOYEES),
        inactive: await tx.userHasPermission(inactiveAdminA, MANAGE_EMPLOYEES),
        courier: await tx.userHasPermission(courierA, MANAGE_EMPLOYEES),
        foreign: await tx.userHasPermission(userB, MANAGE_EMPLOYEES),
        unknown: await tx.userHasPermission(randomUUID(), MANAGE_EMPLOYEES),
      }));

      expect(result).toEqual({
        admin: true,
        inactive: false,
        courier: false,
        foreign: false,
        unknown: false,
      });
    });

    it('counts distinct ACTIVE holders of the permission in this tenant only', async () => {
      await expect(
        repository.runExclusive(tenantA, (tx) =>
          tx.countActiveUsersWithPermission(MANAGE_EMPLOYEES),
        ),
      ).resolves.toBe(1);
      await expect(
        repository.runExclusive(tenantB, (tx) =>
          tx.countActiveUsersWithPermission(MANAGE_EMPLOYEES),
        ),
      ).resolves.toBe(1);
    });

    it('accepts only roles of this tenant', async () => {
      const result = await repository.runExclusive(tenantA, async (tx) => ({
        own: await tx.rolesBelongToTenant([adminRoleA, courierRoleA]),
        duplicated: await tx.rolesBelongToTenant([adminRoleA, adminRoleA]),
        none: await tx.rolesBelongToTenant([]),
        foreign: await tx.rolesBelongToTenant([adminRoleA, adminRoleB]),
        unknown: await tx.rolesBelongToTenant([randomUUID()]),
      }));

      expect(result).toEqual({
        own: true,
        duplicated: true,
        none: true,
        foreign: false,
        unknown: false,
      });
    });

    it('tells whether a role set grants the permission, ignoring foreign roles', async () => {
      const result = await repository.runExclusive(tenantA, async (tx) => ({
        courier: await tx.roleIdsGrantPermission(
          [courierRoleA],
          MANAGE_EMPLOYEES,
        ),
        mixed: await tx.roleIdsGrantPermission(
          [courierRoleA, secondAdminRoleA],
          MANAGE_EMPLOYEES,
        ),
        none: await tx.roleIdsGrantPermission([], MANAGE_EMPLOYEES),
        foreign: await tx.roleIdsGrantPermission(
          [adminRoleB],
          MANAGE_EMPLOYEES,
        ),
      }));

      expect(result).toEqual({
        courier: false,
        mixed: true,
        none: false,
        foreign: false,
      });
    });
  });

  describe('writes', () => {
    it('refuses to change the status of a user of another tenant', async () => {
      await expect(
        repository.runExclusive(tenantA, (tx) =>
          tx.setStatus(userB, 'SUSPENDED'),
        ),
      ).resolves.toBe(false);

      const untouched = await admin.user.findUniqueOrThrow({
        where: { id: userB },
      });
      expect(untouched.status).toBe('ACTIVE');
    });

    it('changes the status of a user of this tenant', async () => {
      await expect(
        repository.runExclusive(tenantA, (tx) =>
          tx.setStatus(courierA, 'SUSPENDED'),
        ),
      ).resolves.toBe(true);
      expect(
        (await admin.user.findUniqueOrThrow({ where: { id: courierA } }))
          .status,
      ).toBe('SUSPENDED');

      await repository.runExclusive(tenantA, (tx) =>
        tx.setStatus(courierA, 'ACTIVE'),
      );
    });

    it('refuses to replace the roles of a user of another tenant and writes nothing', async () => {
      await expect(
        repository.runExclusive(tenantA, (tx) =>
          tx.setRoles(userB, [courierRoleA]),
        ),
      ).resolves.toBe(false);

      expect(await roleIdsOf(userB)).toEqual([adminRoleB]);
      expect(
        await admin.userRole.count({
          where: { tenantId: tenantA, userId: userB },
        }),
      ).toBe(0);
    });

    it('replaces the roles of a user of this tenant', async () => {
      await expect(
        repository.runExclusive(tenantA, (tx) =>
          tx.setRoles(courierA, [secondAdminRoleA, courierRoleA]),
        ),
      ).resolves.toBe(true);
      expect(await roleIdsOf(courierA)).toEqual(
        [secondAdminRoleA, courierRoleA].sort(),
      );

      await repository.runExclusive(tenantA, (tx) =>
        tx.setRoles(courierA, [courierRoleA]),
      );
      expect(await roleIdsOf(courierA)).toEqual([courierRoleA]);
    });

    it('creates a user with its roles in this tenant', async () => {
      const email = `created-${runId}@a.test`;

      const record = await repository.runExclusive(tenantA, (tx) =>
        tx.createUser(email, 'hash-value', [courierRoleA]),
      );

      expect(record).toEqual({
        id: expect.any(String) as string,
        email,
        status: 'ACTIVE',
        roleIds: [courierRoleA],
      });
      const stored = await admin.user.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(stored.tenantId).toBe(tenantA);
      expect(stored.passwordHash).toBe('hash-value');
      expect(await roleIdsOf(record.id)).toEqual([courierRoleA]);
    });

    it('maps the (tenantId, email) unique violation to EmployeeEmailAlreadyExistsError', async () => {
      const email = `courier-${runId}@a.test`;

      await expect(
        repository.runExclusive(tenantA, (tx) =>
          tx.createUser(email, 'hash-value', []),
        ),
      ).rejects.toBeInstanceOf(EmployeeEmailAlreadyExistsError);
      expect(
        await admin.user.count({ where: { tenantId: tenantA, email } }),
      ).toBe(1);
    });

    it('allows an email that exists only in another tenant', async () => {
      const email = `courier-${runId}@a.test`;

      const record = await repository.runExclusive(tenantB, (tx) =>
        tx.createUser(email, 'hash-value', []),
      );

      expect(record.email).toBe(email);
      expect(await admin.user.count({ where: { email } })).toBe(2);
    });

    it('lets other failures propagate unmapped and rolls the user back', async () => {
      const email = `foreign-role-${runId}@a.test`;

      // A role of tenant B violates the composite (tenantId, roleId) FK.
      const failure = await repository
        .runExclusive(tenantA, (tx) =>
          tx.createUser(email, 'hash-value', [adminRoleB]),
        )
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(EmployeeEmailAlreadyExistsError);
      expect(await admin.user.count({ where: { email } })).toBe(0);
    });
  });

  describe('runExclusive', () => {
    it('rolls back every write when the work throws', async () => {
      const failure = new Error('abort');

      await expect(
        repository.runExclusive(tenantA, async (tx) => {
          await tx.setStatus(courierA, 'SUSPENDED');
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(
        (await admin.user.findUniqueOrThrow({ where: { id: courierA } }))
          .status,
      ).toBe('ACTIVE');
    });

    it('serializes exclusive sections of the same tenant', async () => {
      const events: string[] = [];
      let releaseFirst!: () => void;
      const firstMayFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let signalFirstStarted!: () => void;
      const firstStarted = new Promise<void>((resolve) => {
        signalFirstStarted = resolve;
      });

      const first = repository.runExclusive(tenantA, async (tx) => {
        events.push('first:start');
        signalFirstStarted();
        await firstMayFinish;
        await tx.countActiveUsersWithPermission(MANAGE_EMPLOYEES);
        events.push('first:end');
      });
      await firstStarted;

      const second = repository.runExclusive(tenantA, () => {
        events.push('second:start');
        return Promise.resolve();
      });
      // The second section is observably blocked on the advisory lock while
      // the first one still holds it.
      await waitForAdvisoryLockWaiters(tenantA, 1);
      expect(events).toEqual(['first:start']);

      releaseFirst();
      await Promise.all([first, second]);

      expect(events).toEqual(['first:start', 'first:end', 'second:start']);
    });

    it('does not block exclusive sections of another tenant', async () => {
      let releaseFirst!: () => void;
      const firstMayFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let signalFirstStarted!: () => void;
      const firstStarted = new Promise<void>((resolve) => {
        signalFirstStarted = resolve;
      });

      const first = repository.runExclusive(tenantA, async () => {
        signalFirstStarted();
        await firstMayFinish;
      });
      await firstStarted;

      try {
        await expect(
          repository.runExclusive(tenantB, (tx) =>
            tx.countActiveUsersWithPermission(MANAGE_EMPLOYEES),
          ),
        ).resolves.toBe(1);
      } finally {
        releaseFirst();
        await first;
      }
    });

    it('derives a distinct lock key per tenant', () => {
      expect(employeeAdministrationLockKey(tenantA)).not.toBe(
        employeeAdministrationLockKey(tenantB),
      );
    });
  });

  describe('bounded lock wait', () => {
    it('waits at most 3 s for the lock by default', () => {
      expect(EMPLOYEE_ADMIN_LOCK_TIMEOUT_MS).toBe(3000);
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'refuses %p as a lock timeout',
      (value) => {
        expect(() => new PrismaUserManagementRepository(prisma, value)).toThrow(
          'lock timeout',
        );
      },
    );

    it('maps a lock wait that exceeds the timeout to EmployeeAdministrationBusyError without running the work', async () => {
      const impatient = new PrismaUserManagementRepository(prisma, 200);
      const work = jest.fn();
      let outcome: unknown;

      // The spec holds the tenant's lock for longer than the timeout.
      await admin.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeAdministrationLockKey(tenantA)}::text))`;
          outcome = await impatient.runExclusive(tenantA, work).then(
            () => 'entered',
            (error: unknown) => error,
          );
        },
        { timeout: 10000 },
      );

      expect(outcome).toBeInstanceOf(EmployeeAdministrationBusyError);
      expect(work).not.toHaveBeenCalled();
    });

    it('enters normally when the lock is released within the timeout', async () => {
      let entered = false;
      let release!: () => void;
      const mayRelease = new Promise<void>((resolve) => {
        release = resolve;
      });
      let signalLocked!: () => void;
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });

      const holder = admin.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeAdministrationLockKey(tenantA)}::text))`;
          signalLocked();
          await mayRelease;
        },
        { timeout: 10000 },
      );
      await locked;
      const section = repository.runExclusive(tenantA, () => {
        entered = true;
        return Promise.resolve();
      });
      await waitForAdvisoryLockWaiters(tenantA, 1);
      release();
      await holder;
      await section;

      expect(entered).toBe(true);
    });

    it('lets other failures inside the section propagate unmapped', async () => {
      const failure = new Error('not a lock problem');

      await expect(
        repository.runExclusive(tenantA, () => Promise.reject(failure)),
      ).rejects.toBe(failure);
    });
  });

  describe('listRoles and recordAudit', () => {
    it('lists only the roles of the requested tenant ordered by name with their permissions', async () => {
      const rolesA = await repository.listRoles(tenantA);

      expect(rolesA).toEqual([
        {
          id: adminRoleA,
          name: 'Admin',
          permissions: [MANAGE_EMPLOYEES],
        },
        {
          id: secondAdminRoleA,
          name: 'Admin 2',
          permissions: [MANAGE_EMPLOYEES],
        },
        {
          id: courierRoleA,
          name: 'Courier',
          permissions: ['OPERATE_DELIVERIES'],
        },
      ]);
      expect(rolesA.some((role) => role.id === adminRoleB)).toBe(false);
    });

    it('persists recordAudit entries inside runExclusive and rolls them back on failure', async () => {
      await repository.runExclusive(tenantA, async (tx) => {
        await tx.recordAudit({
          actorUserId: adminUserA,
          action: 'EMPLOYEE_STATUS_UPDATED',
          targetUserId: courierA,
          metadata: { status: 'ACTIVE' },
        });
      });

      await expect(
        repository.runExclusive(tenantA, async (tx) => {
          await tx.recordAudit({
            actorUserId: adminUserA,
            action: 'EMPLOYEE_ROLES_UPDATED',
            targetUserId: courierA,
            metadata: { roleIds: [adminRoleA] },
          });
          throw new Error('abort transaction');
        }),
      ).rejects.toThrow('abort transaction');

      const audits = await admin.auditLog.findMany({
        where: { tenantId: tenantA, entityId: courierA },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        tenantId: tenantA,
        actorUserId: adminUserA,
        action: 'EMPLOYEE_STATUS_UPDATED',
        entityType: 'User',
        entityId: courierA,
        metadata: { status: 'ACTIVE' },
      });
    });
  });
});
