import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { ProvisioningPrismaService } from './provisioning-prisma.service';
import { TenantProvisioningRepository } from '../domain/tenant-provisioning.repository';
import type {
  ProvisionTenantInput,
  TenantProvisioningOutcome,
} from '../domain/provision-tenant.types';

const TENANT_SLUG_UNIQUE_INDEX = 'Tenant_slug_key';

// True only for a unique violation on Tenant.slug. The pg driver adapter
// reports the violated index name; older engines report the target fields.
function isTenantSlugConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const meta = error.meta as
    | {
        target?: unknown;
        driverAdapterError?: {
          cause?: { constraint?: { index?: unknown; fields?: unknown } };
        };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;

  if (constraint?.index === TENANT_SLUG_UNIQUE_INDEX) {
    return true;
  }
  const fields = constraint?.fields ?? meta?.target;

  return (
    error.meta?.modelName === 'Tenant' &&
    Array.isArray(fields) &&
    fields.length === 1 &&
    fields[0] === 'slug'
  );
}

@Injectable()
export class PrismaTenantProvisioningRepository extends TenantProvisioningRepository {
  constructor(private readonly prisma: ProvisioningPrismaService) {
    super();
  }

  async provision(
    input: ProvisionTenantInput,
  ): Promise<TenantProvisioningOutcome> {
    // The id is chosen up front so it can be declared to RLS before the
    // insert: sls_provisioning may only insert and see the Tenant whose id
    // equals app.tenant_id, and the child tables' tenant_isolation policies
    // use the same setting.
    const tenantId = randomUUID();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

        // Uniqueness is enforced by the database: no check-then-insert race.
        await tx.tenant.create({
          data: { id: tenantId, name: input.name, slug: input.slug },
          select: { id: true },
        });

        const adminUser = await tx.user.create({
          data: {
            tenantId,
            email: input.adminEmail,
            passwordHash: input.adminPasswordHash,
          },
          select: { id: true },
        });

        const codes = [
          ...new Set(input.roles.flatMap((role) => role.permissionCodes)),
        ];
        const permissions = await tx.permission.findMany({
          where: { code: { in: codes } },
          select: { id: true, code: true },
        });
        const permissionIdByCode = new Map(
          permissions.map((p) => [p.code, p.id] as const),
        );
        const missing = codes.filter((code) => !permissionIdByCode.has(code));
        if (missing.length > 0) {
          // Rolls back the whole transaction: the catalog references a
          // permission that was never seeded.
          throw new Error(`Permission codes not seeded: ${missing.join(', ')}`);
        }

        for (const roleDefinition of input.roles) {
          const role = await tx.role.create({
            data: { tenantId, name: roleDefinition.name },
            select: { id: true },
          });

          await tx.rolePermission.createMany({
            data: roleDefinition.permissionCodes.map((code) => ({
              tenantId,
              roleId: role.id,
              permissionId: permissionIdByCode.get(code) as string,
            })),
          });

          if (roleDefinition.grantedToFirstAdmin) {
            await tx.userRole.create({
              data: { tenantId, userId: adminUser.id, roleId: role.id },
              select: { roleId: true },
            });
          }
        }

        // Never the password or its hash.
        await tx.auditLog.create({
          data: {
            tenantId,
            actorPlatformAdminId: input.actorPlatformAdminId,
            action: 'TENANT_PROVISIONED',
            entityType: 'Tenant',
            entityId: tenantId,
            metadata: {
              slug: input.slug,
              adminUserId: adminUser.id,
              adminEmail: input.adminEmail,
            },
          },
          select: { id: true },
        });
      });
    } catch (error) {
      if (isTenantSlugConflict(error)) {
        return { kind: 'SLUG_ALREADY_EXISTS' };
      }
      throw error;
    }

    return { kind: 'OK', tenantId };
  }
}
