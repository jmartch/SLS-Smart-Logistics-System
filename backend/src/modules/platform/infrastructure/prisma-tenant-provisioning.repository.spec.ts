import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../generated/prisma/client';
import { ProvisioningPrismaService } from './provisioning-prisma.service';
import { PrismaTenantProvisioningRepository } from './prisma-tenant-provisioning.repository';
import { DEFAULT_ROLES } from '../domain/default-roles';
import type {
  ProvisionTenantInput,
  RoleDefinition,
} from '../domain/provision-tenant.types';

// Runs against the real database as the sls_provisioning role: the behavior
// under test is the RLS policies and grants of that role, the single
// transaction, and the unique-slug mapping. The admin connection (DATABASE_URL)
// is used only to create the platform admin fixture, verify, and clean up.
describe('PrismaTenantProvisioningRepository', () => {
  jest.setTimeout(30000);

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  let provisioning: ProvisioningPrismaService;
  let repository: PrismaTenantProvisioningRepository;
  const run = randomUUID().slice(0, 8);
  let platformAdminId: string;

  // Everything this spec creates is tracked so afterAll deletes only those
  // rows. Prisma drops `undefined` filters, so ids are only ever pushed after
  // a successful create and every delete is guarded by a non-empty list.
  const created = {
    platformAdminIds: [] as string[],
    tenantIds: [] as string[],
    slugs: [] as string[],
  };

  function input(
    label: string,
    overrides: Partial<ProvisionTenantInput> = {},
  ): ProvisionTenantInput {
    const slug = `prov-repo-${label}-${run}`;
    created.slugs.push(slug);
    return {
      name: `Prov Repo ${label} ${run}`,
      slug,
      adminEmail: `owner-${label}-${run}@prov-repo.test`,
      adminPasswordHash: 'not-a-real-hash',
      roles: DEFAULT_ROLES,
      actorPlatformAdminId: platformAdminId,
      ...overrides,
    };
  }

  beforeAll(async () => {
    for (const name of ['DATABASE_URL', 'PROVISIONING_DATABASE_URL']) {
      if (!process.env[name]) {
        throw new Error(
          `${name} is not set. This spec needs the real database; run it through ` +
            '`docker compose exec backend npm test` so both connection URLs exist.',
        );
      }
    }

    await admin.$connect();
    provisioning = new ProvisioningPrismaService();
    await provisioning.onModuleInit();
    repository = new PrismaTenantProvisioningRepository(provisioning);

    const platformAdmin = await admin.platformAdmin.create({
      data: {
        email: `prov-repo-${run}@prov-repo.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    created.platformAdminIds.push(platformAdmin.id);
    platformAdminId = platformAdmin.id;
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

    // Tenants that a failed assertion left untracked are recovered by their
    // run-specific slug, never by a broader filter.
    if (created.slugs.length > 0) {
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
    }

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
      await attempt(() =>
        admin.auditLog.deleteMany({
          where: { actorPlatformAdminId: { in: platformAdminIds } },
        }),
      );
      await attempt(() =>
        admin.platformAdmin.deleteMany({
          where: { id: { in: platformAdminIds } },
        }),
      );
    }
    if (provisioning) {
      await attempt(() => provisioning.onModuleDestroy());
    }
    await attempt(() => admin.$disconnect());

    if (errors.length > 0) {
      throw errors[0];
    }
  });

  it('creates the tenant, first admin, five roles with their permissions, the admin role binding and an audit row', async () => {
    const data = input('ok');

    const result = await repository.provision(data);

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    created.tenantIds.push(result.tenantId);
    const tenantId = result.tenantId;

    const tenant = await admin.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    expect(tenant).toMatchObject({
      name: data.name,
      slug: data.slug,
      status: 'ACTIVE',
    });

    const users = await admin.user.findMany({ where: { tenantId } });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: data.adminEmail,
      passwordHash: data.adminPasswordHash,
      status: 'ACTIVE',
    });

    const roles = await admin.role.findMany({
      where: { tenantId },
      include: { rolePermissions: { include: { permission: true } } },
    });
    const codesByRole = new Map(
      roles.map((role) => [
        role.name,
        role.rolePermissions.map((rp) => rp.permission.code).sort(),
      ]),
    );
    expect(codesByRole).toEqual(
      new Map([
        [
          'Administrador',
          [
            'CLASSIFY_PACKAGES',
            'COORDINATE_ROUTES',
            'MANAGE_EMPLOYEES',
            'MANAGE_TENANT',
            'OPERATE_DELIVERIES',
            'REGISTER_PACKAGES',
          ],
        ],
        ['Recepcion', ['REGISTER_PACKAGES']],
        ['Clasificacion', ['CLASSIFY_PACKAGES']],
        ['Coordinador de ruta', ['COORDINATE_ROUTES']],
        ['Mensajero', ['OPERATE_DELIVERIES']],
      ]),
    );
    expect(
      roles.every((role) =>
        role.rolePermissions.every((rp) => rp.tenantId === tenantId),
      ),
    ).toBe(true);

    const userRoles = await admin.userRole.findMany({
      where: { tenantId },
      include: { role: true },
    });
    expect(userRoles).toHaveLength(1);
    expect(userRoles[0].userId).toBe(users[0].id);
    expect(userRoles[0].role.name).toBe('Administrador');

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
    expect(metadata).toContain(data.adminEmail);
    expect(metadata).not.toContain(data.adminPasswordHash);
    expect(metadata.toLowerCase()).not.toContain('password');
  });

  it('rolls everything back when any step fails', async () => {
    const brokenCatalog: readonly RoleDefinition[] = [
      ...DEFAULT_ROLES,
      {
        name: 'Rol roto',
        permissionCodes: ['NOT_A_SEEDED_PERMISSION'],
        grantedToFirstAdmin: false,
      },
    ];
    const data = input('rollback', { roles: brokenCatalog });

    await expect(repository.provision(data)).rejects.toThrow();

    expect(await admin.tenant.count({ where: { slug: data.slug } })).toBe(0);
    expect(await admin.user.count({ where: { email: data.adminEmail } })).toBe(
      0,
    );
    expect(await admin.role.count({ where: { name: 'Rol roto' } })).toBe(0);
    expect(
      await admin.auditLog.count({
        where: {
          actorPlatformAdminId: platformAdminId,
          metadata: { path: ['slug'], equals: data.slug },
        },
      }),
    ).toBe(0);
  });

  it('maps a duplicate slug to SLUG_ALREADY_EXISTS and leaves the original tenant untouched', async () => {
    const first = input('dup');
    const original = await repository.provision(first);
    expect(original.kind).toBe('OK');
    if (original.kind !== 'OK') return;
    created.tenantIds.push(original.tenantId);

    const second = {
      ...first,
      name: `Other name ${run}`,
      adminEmail: `second-dup-${run}@prov-repo.test`,
    };
    const result = await repository.provision(second);

    expect(result).toEqual({ kind: 'SLUG_ALREADY_EXISTS' });
    expect(
      await admin.tenant.findMany({ where: { slug: first.slug } }),
    ).toEqual([
      expect.objectContaining({ id: original.tenantId, name: first.name }),
    ]);
    expect(
      await admin.user.count({ where: { tenantId: original.tenantId } }),
    ).toBe(1);
    expect(
      await admin.user.count({ where: { email: second.adminEmail } }),
    ).toBe(0);
  });

  it('propagates a unique violation that is not on the slug instead of reporting a slug conflict', async () => {
    // Two roles with the same name violate Role (tenantId, name), not the slug.
    const data = input('other-unique', {
      roles: [DEFAULT_ROLES[1], DEFAULT_ROLES[1]],
    });

    await expect(repository.provision(data)).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(await admin.tenant.count({ where: { slug: data.slug } })).toBe(0);
  });

  describe('sls_provisioning privileges', () => {
    it('sees no tenant and cannot insert one without the transaction-local tenant id', async () => {
      // At least one tenant exists (created by the tests above or others).
      expect(await admin.tenant.count()).toBeGreaterThan(0);
      expect(await provisioning.tenant.count()).toBe(0);

      const slug = `prov-repo-bare-${run}`;
      created.slugs.push(slug);
      await expect(
        provisioning.tenant.create({
          data: { name: `Bare ${run}`, slug },
          select: { id: true },
        }),
      ).rejects.toThrow(/row-level security/i);
    });

    it('cannot insert a tenant whose id differs from the declared one, and sees only the declared tenant', async () => {
      const declared = randomUUID();
      const slug = `prov-repo-mismatch-${run}`;
      created.slugs.push(slug);

      await expect(
        provisioning.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('app.tenant_id', ${declared}, true)`;
          await tx.tenant.create({
            data: { id: randomUUID(), name: `Mismatch ${run}`, slug },
            select: { id: true },
          });
        }),
      ).rejects.toThrow(/row-level security/i);

      const visible = await provisioning.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${declared}, true)`;
        return tx.tenant.count();
      });
      expect(visible).toBe(0);
    });

    it('cannot write PlatformAdmin or Permission', async () => {
      await expect(
        provisioning.platformAdmin.create({
          data: {
            email: `forbidden-${run}@prov-repo.test`,
            passwordHash: 'x',
          },
          select: { id: true },
        }),
      ).rejects.toThrow(/permission denied/i);

      await expect(
        provisioning.permission.create({
          data: { code: `FORBIDDEN_${run}`, description: 'x' },
          select: { id: true },
        }),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
