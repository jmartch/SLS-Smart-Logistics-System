import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaTenantUserLookupRepository } from './prisma-tenant-user-lookup.repository';

// Runs against the real database: the behavior under test is the actual SQL
// (RLS on User/Role/UserRole/RolePermission, composite unique lookup).
// Fixtures are created through the admin connection because sls_app cannot
// create Tenant or User rows. Permission rows are global and seeded: the spec
// only reads existing codes and never creates or deletes them.
describe('PrismaTenantUserLookupRepository', () => {
  jest.setTimeout(30000);

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const prisma = new PrismaService();
  const repository = new PrismaTenantUserLookupRepository(prisma);
  const runId = randomUUID();
  const sharedEmail = `shared-${runId}@lookup-repo.test`;

  let tenantAId: string;
  let tenantBId: string;
  let tenantASlug: string;
  let tenantBSlug: string;
  let tenantCId: string;
  let tenantCSlug: string;
  let sharedPermissionId: string;
  let tenantAUserId: string;
  let tenantBUserId: string;
  let sharedPermissionCode: string;
  let uniquePermissionCode: string;
  let roleOneId: string;
  let roleTwoId: string;
  // Ids actually created by this spec. afterAll builds its filters only from
  // these: Prisma drops `undefined` filters, so an `undefined` id would turn a
  // scoped deleteMany into a delete of every row in the shared database.
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    for (const name of ['DATABASE_URL', 'RUNTIME_DATABASE_URL']) {
      if (!process.env[name]) {
        throw new Error(
          `${name} is not set. This spec needs the real database; run it through ` +
            '`docker compose exec backend npm test` so both connection URLs exist.',
        );
      }
    }

    await admin.$connect();
    await prisma.onModuleInit();

    const permissions = await admin.permission.findMany({
      where: { code: { in: ['MANAGE_EMPLOYEES', 'REGISTER_PACKAGES'] } },
    });
    const shared = permissions.find((p) => p.code === 'MANAGE_EMPLOYEES');
    const unique = permissions.find((p) => p.code === 'REGISTER_PACKAGES');
    if (!shared || !unique) {
      throw new Error(
        'Seeded permissions MANAGE_EMPLOYEES and REGISTER_PACKAGES are required.',
      );
    }
    sharedPermissionCode = shared.code;
    uniquePermissionCode = unique.code;
    sharedPermissionId = shared.id;

    tenantASlug = `lookup-a-${runId}`;
    tenantBSlug = `lookup-b-${runId}`;
    tenantCSlug = `lookup-c-${runId}`;
    const tenantA = await admin.tenant.create({
      data: {
        name: `lookup-repo-spec-a-${runId}`,
        slug: tenantASlug,
      },
    });
    createdTenantIds.push(tenantA.id);
    tenantAId = tenantA.id;
    const tenantB = await admin.tenant.create({
      data: { name: `lookup-repo-spec-b-${runId}`, slug: tenantBSlug },
    });
    createdTenantIds.push(tenantB.id);
    tenantBId = tenantB.id;
    // Tenant C is the suspended one; A and B stay ACTIVE so the permission
    // lookups for A prove ACTIVE users in ACTIVE tenants keep their access.
    const tenantC = await admin.tenant.create({
      data: {
        name: `lookup-repo-spec-c-${runId}`,
        slug: tenantCSlug,
        status: 'SUSPENDED',
      },
    });
    createdTenantIds.push(tenantC.id);
    tenantCId = tenantC.id;

    // Two roles in tenant A share MANAGE_EMPLOYEES; REGISTER_PACKAGES only on
    // the second. The flattened result must list each code exactly once.
    const roleOne = await admin.role.create({
      data: { tenantId: tenantAId, name: `role-one-${runId}` },
    });
    createdRoleIds.push(roleOne.id);
    roleOneId = roleOne.id;
    const roleTwo = await admin.role.create({
      data: { tenantId: tenantAId, name: `role-two-${runId}` },
    });
    createdRoleIds.push(roleTwo.id);
    roleTwoId = roleTwo.id;
    await admin.rolePermission.createMany({
      data: [
        { tenantId: tenantAId, roleId: roleOne.id, permissionId: shared.id },
        { tenantId: tenantAId, roleId: roleTwo.id, permissionId: shared.id },
        { tenantId: tenantAId, roleId: roleTwo.id, permissionId: unique.id },
      ],
    });

    const userA = await admin.user.create({
      data: {
        tenantId: tenantAId,
        email: sharedEmail,
        passwordHash: 'not-a-real-hash',
      },
    });
    createdUserIds.push(userA.id);
    tenantAUserId = userA.id;
    await admin.userRole.createMany({
      data: [
        { tenantId: tenantAId, userId: userA.id, roleId: roleOne.id },
        { tenantId: tenantAId, userId: userA.id, roleId: roleTwo.id },
      ],
    });

    const userB = await admin.user.create({
      data: {
        tenantId: tenantBId,
        email: sharedEmail,
        passwordHash: 'not-a-real-hash-b',
      },
    });
    createdUserIds.push(userB.id);
    tenantBUserId = userB.id;
  }, 30000);

  afterAll(async () => {
    // Each step is isolated so one failure cannot skip the remaining deletes
    // or the disconnects; the first failure is rethrown at the end.
    const failures: unknown[] = [];
    const step = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        failures.push(error);
      }
    };

    await step(async () => {
      if (createdUserIds.length > 0) {
        await admin.userRole.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
      }
    });
    await step(async () => {
      if (createdRoleIds.length > 0) {
        await admin.rolePermission.deleteMany({
          where: { roleId: { in: createdRoleIds } },
        });
      }
    });
    await step(async () => {
      if (createdRoleIds.length > 0) {
        await admin.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      }
    });
    await step(async () => {
      if (createdUserIds.length > 0) {
        await admin.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    });
    await step(async () => {
      if (createdTenantIds.length > 0) {
        await admin.tenant.deleteMany({
          where: { id: { in: createdTenantIds } },
        });
      }
    });
    await step(() => admin.$disconnect());
    await step(() => prisma.onModuleDestroy());

    if (failures.length > 0) {
      throw failures[0];
    }
  }, 30000);

  describe('findTenantBySlug', () => {
    it('returns the tenant id and its mapped status', async () => {
      await expect(repository.findTenantBySlug(tenantASlug)).resolves.toEqual({
        id: tenantAId,
        status: 'ACTIVE',
      });
      await expect(repository.findTenantBySlug(tenantCSlug)).resolves.toEqual({
        id: tenantCId,
        status: 'SUSPENDED',
      });
      await expect(repository.findTenantBySlug(tenantBSlug)).resolves.toEqual({
        id: tenantBId,
        status: 'ACTIVE',
      });
    });

    it('returns null for an unknown slug', async () => {
      await expect(
        repository.findTenantBySlug(`missing-${runId}`),
      ).resolves.toBeNull();
    });
  });

  it('does not expose tenants outside the slug lookup (RLS stays closed)', async () => {
    // A plain query on the runtime connection, with no tenant or slug setting,
    // must still see no Tenant rows: the slug policy is not a general read.
    await expect(prisma.tenant.findMany()).resolves.toEqual([]);
    await expect(repository.findTenantBySlug('')).resolves.toBeNull();
  });

  describe('findUserForLogin', () => {
    it('returns the user with flattened, de-duplicated permission codes', async () => {
      const user = await repository.findUserForLogin(tenantAId, sharedEmail);

      expect(user).toMatchObject({
        id: tenantAUserId,
        tenantId: tenantAId,
        passwordHash: 'not-a-real-hash',
        status: 'ACTIVE',
      });
      expect([...(user?.permissions ?? [])].sort()).toEqual(
        [sharedPermissionCode, uniquePermissionCode].sort(),
      );
    });

    it('resolves a shared email strictly within the requested tenant', async () => {
      const userB = await repository.findUserForLogin(tenantBId, sharedEmail);

      expect(userB).toMatchObject({
        id: tenantBUserId,
        tenantId: tenantBId,
        passwordHash: 'not-a-real-hash-b',
        permissions: [],
      });
    });

    it('returns null for an email that exists only in another tenant', async () => {
      const onlyInA = `only-a-${runId}@lookup-repo.test`;
      const created = await admin.user.create({
        data: {
          tenantId: tenantAId,
          email: onlyInA,
          passwordHash: 'not-a-real-hash',
        },
      });
      createdUserIds.push(created.id);

      await expect(
        repository.findUserForLogin(tenantBId, onlyInA),
      ).resolves.toBeNull();
    });

    it('returns null for an unknown email', async () => {
      await expect(
        repository.findUserForLogin(
          tenantAId,
          `unknown-${runId}@lookup-repo.test`,
        ),
      ).resolves.toBeNull();
    });
  });

  describe('findPermissionsForUser', () => {
    it('returns the flattened, de-duplicated permission codes of an active user', async () => {
      const permissions = await repository.findPermissionsForUser(
        tenantAId,
        tenantAUserId,
      );

      expect([...permissions].sort()).toEqual(
        [sharedPermissionCode, uniquePermissionCode].sort(),
      );
    });

    it('returns an empty list (still a valid actor) for an ACTIVE user without roles', async () => {
      await expect(
        repository.findPermissionsForUser(tenantBId, tenantBUserId),
      ).resolves.toEqual([]);
    });

    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      'returns null (not a valid actor) for a %s user even though roles grant permissions',
      async (status) => {
        const user = await admin.user.create({
          data: {
            tenantId: tenantAId,
            email: `${status.toLowerCase()}-${runId}@lookup-repo.test`,
            passwordHash: 'not-a-real-hash',
            status,
          },
        });
        createdUserIds.push(user.id);
        await admin.userRole.create({
          data: { tenantId: tenantAId, userId: user.id, roleId: roleTwoId },
        });

        await expect(
          repository.findPermissionsForUser(tenantAId, user.id),
        ).resolves.toBeNull();
      },
    );

    it('returns null for an ACTIVE user whose tenant is SUSPENDED', async () => {
      const role = await admin.role.create({
        data: { tenantId: tenantCId, name: `role-c-${runId}` },
      });
      createdRoleIds.push(role.id);
      await admin.rolePermission.create({
        data: {
          tenantId: tenantCId,
          roleId: role.id,
          permissionId: sharedPermissionId,
        },
      });
      const user = await admin.user.create({
        data: {
          tenantId: tenantCId,
          email: `active-in-suspended-${runId}@lookup-repo.test`,
          passwordHash: 'not-a-real-hash',
          status: 'ACTIVE',
        },
      });
      createdUserIds.push(user.id);
      await admin.userRole.create({
        data: { tenantId: tenantCId, userId: user.id, roleId: role.id },
      });

      await expect(
        repository.findPermissionsForUser(tenantCId, user.id),
      ).resolves.toBeNull();
    });

    it('returns null when the user belongs to another tenant', async () => {
      await expect(
        repository.findPermissionsForUser(tenantBId, tenantAUserId),
      ).resolves.toBeNull();
    });

    it('returns null for an unknown user id', async () => {
      await expect(
        repository.findPermissionsForUser(tenantAId, randomUUID()),
      ).resolves.toBeNull();
    });
  });

  describe('findUserProfile', () => {
    it('returns the email and the { id, name } roles of the user, ordered by name', async () => {
      await expect(
        repository.findUserProfile(tenantAId, tenantAUserId),
      ).resolves.toEqual({
        email: sharedEmail,
        roles: [
          { id: roleOneId, name: `role-one-${runId}` },
          { id: roleTwoId, name: `role-two-${runId}` },
        ],
      });
    });

    it('returns an empty roles list for a user without roles', async () => {
      await expect(
        repository.findUserProfile(tenantBId, tenantBUserId),
      ).resolves.toEqual({ email: sharedEmail, roles: [] });
    });

    it('returns null when the user belongs to another tenant', async () => {
      await expect(
        repository.findUserProfile(tenantBId, tenantAUserId),
      ).resolves.toBeNull();
    });

    it('returns null for an unknown user id', async () => {
      await expect(
        repository.findUserProfile(tenantAId, randomUUID()),
      ).resolves.toBeNull();
    });
  });
});
