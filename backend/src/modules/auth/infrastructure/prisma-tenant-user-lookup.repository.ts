import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import {
  TenantUserLookupRepository,
  type TenantLookup,
  type TenantUserProfile,
  type UserForLogin,
} from '../domain/tenant-user-lookup.repository';

@Injectable()
export class PrismaTenantUserLookupRepository extends TenantUserLookupRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Cannot use runWithTenant: resolving the tenant by slug is the step that
  // happens before any tenant id exists. Tenant is protected by RLS, so the
  // slug is passed as a transaction-local setting (bound, not interpolated)
  // that the tenant_login_lookup policy matches; only that one row is visible.
  async findTenantBySlug(slug: string): Promise<TenantLookup | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.login_tenant_slug', ${slug}, true)`;

      const tenant = await tx.tenant.findUnique({ where: { slug } });

      if (!tenant) {
        return null;
      }

      return { id: tenant.id, status: tenant.status };
    });
  }

  async findUserForLogin(
    tenantId: string,
    email: string,
  ): Promise<UserForLogin | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { tenantId_email: { tenantId, email } },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      });

      if (!user) {
        return null;
      }

      const permissions = new Set<string>();
      for (const userRole of user.userRoles) {
        for (const rolePermission of userRole.role.rolePermissions) {
          permissions.add(rolePermission.permission.code);
        }
      }

      return {
        id: user.id,
        tenantId: user.tenantId,
        passwordHash: user.passwordHash,
        status: user.status,
        permissions: Array.from(permissions),
      };
    });
  }

  async findPermissionsForUser(
    tenantId: string,
    userId: string,
  ): Promise<readonly string[] | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      // Status is read here rather than trusted from the session row: a user
      // deactivated or suspended after login, or a tenant suspended after
      // login, is no longer an actor at all (null), which is distinct from an
      // ACTIVE user without roles (empty list).
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!tenant) {
        return null;
      }

      const user = await tx.user.findFirst({
        where: { id: userId, tenantId, status: 'ACTIVE' },
        select: { id: true },
      });

      if (!user) {
        return null;
      }

      const userRoles = await tx.userRole.findMany({
        where: { tenantId, userId },
        include: {
          role: {
            include: { rolePermissions: { include: { permission: true } } },
          },
        },
      });

      const permissions = new Set<string>();
      for (const userRole of userRoles) {
        for (const rolePermission of userRole.role.rolePermissions) {
          permissions.add(rolePermission.permission.code);
        }
      }

      return Array.from(permissions);
    });
  }

  async findUserProfile(
    tenantId: string,
    userId: string,
  ): Promise<TenantUserProfile | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      // Explicit select: the password hash is never read here.
      const user = await tx.user.findFirst({
        where: { id: userId, tenantId },
        select: {
          email: true,
          userRoles: {
            where: { tenantId },
            select: { role: { select: { id: true, name: true } } },
            orderBy: { role: { name: 'asc' } },
          },
        },
      });

      if (!user) {
        return null;
      }

      return {
        email: user.email,
        roles: user.userRoles.map(({ role }) => ({
          id: role.id,
          name: role.name,
        })),
      };
    });
  }
}
