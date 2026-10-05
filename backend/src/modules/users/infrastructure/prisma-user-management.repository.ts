import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  runWithTenant,
  type TenantTransactionOptions,
} from '../../../database/run-with-tenant';
import {
  UserManagementRepository,
  type UserManagementTx,
} from '../domain/user-management.repository';
import {
  EmployeeAdministrationBusyError,
  EmployeeEmailAlreadyExistsError,
  type EmployeeRecord,
  type EmployeeStatus,
} from '../domain/employee';

const USER_TENANT_EMAIL_UNIQUE_INDEX = 'User_tenantId_email_key';

// How long an exclusive section waits for the tenant's lock before giving up
// with EmployeeAdministrationBusyError. Waiting holds a pooled connection, so
// the wait is bounded rather than left to the transaction timeout.
export const EMPLOYEE_ADMIN_LOCK_TIMEOUT_MS = 3000;

// Optional override of EMPLOYEE_ADMIN_LOCK_TIMEOUT_MS (milliseconds). Not
// provided in production; it exists so tests can shrink the wait.
export const EMPLOYEE_ADMIN_LOCK_TIMEOUT = Symbol(
  'EMPLOYEE_ADMIN_LOCK_TIMEOUT',
);

// The exclusive transaction must outlive the lock wait plus the work: a
// transaction timeout shorter than the lock timeout would abort it with a
// generic error instead of the mapped busy outcome.
const EXCLUSIVE_TRANSACTION_OPTIONS: TenantTransactionOptions = {
  maxWait: 5000,
  timeout: 15000,
};

// SQLSTATE lock_not_available: raised when lock_timeout expires.
const LOCK_NOT_AVAILABLE = '55P03';

// True when the database cancelled a lock wait because lock_timeout expired.
// The pg driver adapter has no dedicated kind for this SQLSTATE, so Prisma
// reports a raw-query failure (P2010) whose meta.driverAdapterError.cause
// carries it in `code` (and `originalCode`).
function isLockTimeout(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  const meta = error.meta as
    | {
        driverAdapterError?: {
          cause?: { code?: unknown; originalCode?: unknown };
        };
      }
    | undefined;
  const cause = meta?.driverAdapterError?.cause;

  return (
    cause?.code === LOCK_NOT_AVAILABLE ||
    cause?.originalCode === LOCK_NOT_AVAILABLE
  );
}

// Text hashed into the transaction-scoped advisory lock that serializes
// employee administration per tenant. The prefix keeps it apart from any
// other advisory lock the application may take on the same tenant id.
export function employeeAdministrationLockKey(tenantId: string): string {
  return `employee-admin:${tenantId}`;
}

// True only for a unique violation on User(tenantId, email). The pg driver
// adapter reports the violated index name; older engines report the fields.
function isTenantEmailConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const meta = error.meta as
    | {
        modelName?: unknown;
        target?: unknown;
        driverAdapterError?: {
          cause?: { constraint?: { index?: unknown; fields?: unknown } };
        };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;

  if (constraint?.index === USER_TENANT_EMAIL_UNIQUE_INDEX) {
    return true;
  }
  const fields = constraint?.fields ?? meta?.target;

  return (
    meta?.modelName === 'User' &&
    Array.isArray(fields) &&
    fields.length === 2 &&
    fields.includes('tenantId') &&
    fields.includes('email')
  );
}

function grantsPermission(permissionCode: string) {
  return {
    role: {
      rolePermissions: { some: { permission: { code: permissionCode } } },
    },
  };
}

// Bound to one runWithTenant transaction: RLS (app.tenant_id) and the explicit
// tenantId filters both scope every statement to the tenant.
class PrismaUserManagementTx implements UserManagementTx {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly tenantId: string,
  ) {}

  async createUser(
    email: string,
    passwordHash: string,
    roleIds: readonly string[],
  ): Promise<EmployeeRecord> {
    const { tenantId } = this;
    let user: { id: string; email: string; status: EmployeeStatus };

    try {
      user = await this.tx.user.create({
        data: { tenantId, email, passwordHash },
        select: { id: true, email: true, status: true },
      });
    } catch (error) {
      // Thrown, not returned: the failed INSERT has aborted the transaction.
      if (isTenantEmailConflict(error)) {
        throw new EmployeeEmailAlreadyExistsError();
      }
      throw error;
    }

    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length > 0) {
      await this.tx.userRole.createMany({
        data: uniqueRoleIds.map((roleId) => ({
          tenantId,
          userId: user.id,
          roleId,
        })),
      });
    }

    return { ...user, roleIds: uniqueRoleIds };
  }

  async userHasPermission(
    userId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const count = await this.tx.user.count({
      where: {
        tenantId: this.tenantId,
        id: userId,
        status: 'ACTIVE',
        userRoles: { some: grantsPermission(permissionCode) },
      },
    });

    return count > 0;
  }

  countActiveUsersWithPermission(permissionCode: string): Promise<number> {
    return this.tx.user.count({
      where: {
        tenantId: this.tenantId,
        status: 'ACTIVE',
        userRoles: { some: grantsPermission(permissionCode) },
      },
    });
  }

  async rolesBelongToTenant(roleIds: readonly string[]): Promise<boolean> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length === 0) {
      return true;
    }

    const count = await this.tx.role.count({
      where: { tenantId: this.tenantId, id: { in: uniqueRoleIds } },
    });

    return count === uniqueRoleIds.length;
  }

  async roleIdsGrantPermission(
    roleIds: readonly string[],
    permissionCode: string,
  ): Promise<boolean> {
    if (roleIds.length === 0) {
      return false;
    }

    const count = await this.tx.role.count({
      where: {
        tenantId: this.tenantId,
        id: { in: [...roleIds] },
        rolePermissions: { some: { permission: { code: permissionCode } } },
      },
    });

    return count > 0;
  }

  async setStatus(userId: string, status: EmployeeStatus): Promise<boolean> {
    const updated = await this.tx.user.updateMany({
      where: { tenantId: this.tenantId, id: userId },
      data: { status },
    });

    return updated.count > 0;
  }

  async setRoles(userId: string, roleIds: readonly string[]): Promise<boolean> {
    const { tenantId } = this;
    // The composite (tenantId, userId) FK would reject a cross-tenant
    // UserRole insert, but only after the delete and with a database error;
    // this check turns a foreign or unknown id into "not found" before any
    // write.
    const owned = await this.tx.user.count({ where: { tenantId, id: userId } });

    if (owned === 0) {
      return false;
    }

    await this.tx.userRole.deleteMany({ where: { tenantId, userId } });
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length > 0) {
      await this.tx.userRole.createMany({
        data: uniqueRoleIds.map((roleId) => ({ tenantId, userId, roleId })),
      });
    }

    return true;
  }
}

@Injectable()
export class PrismaUserManagementRepository extends UserManagementRepository {
  private readonly lockTimeout: string;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(EMPLOYEE_ADMIN_LOCK_TIMEOUT)
    lockTimeoutMs: number = EMPLOYEE_ADMIN_LOCK_TIMEOUT_MS,
  ) {
    super();
    if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs <= 0) {
      throw new Error(
        'PrismaUserManagementRepository: the lock timeout must be a positive integer of milliseconds',
      );
    }
    this.lockTimeout = `${lockTimeoutMs}ms`;
  }

  list(tenantId: string): Promise<readonly EmployeeRecord[]> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const users = await tx.user.findMany({
        where: { tenantId },
        // Explicit select: the password hash is never read here.
        select: {
          id: true,
          email: true,
          status: true,
          userRoles: { select: { roleId: true } },
        },
        orderBy: { email: 'asc' },
      });

      return users.map((user) => ({
        id: user.id,
        email: user.email,
        status: user.status,
        roleIds: user.userRoles.map((userRole) => userRole.roleId),
      }));
    });
  }

  // One runWithTenant transaction holding a per-tenant advisory lock until
  // commit or rollback. An advisory lock is used rather than a row lock
  // because sls_app cannot lock the Tenant row (SELECT-only grant, so no
  // FOR UPDATE), and locking the current admins' User rows would not cover
  // concurrent grants or creations. The key is passed as a bound parameter;
  // under READ COMMITTED every statement after the lock sees the work that
  // the previous holder committed.
  //
  // The lock wait is bounded by a transaction-local lock_timeout (a bound
  // parameter, never user input). It stays set for the whole section, so any
  // lock wait in it is bounded; when one expires the transaction is rolled
  // back and the outcome is EmployeeAdministrationBusyError.
  async runExclusive<T>(
    tenantId: string,
    work: (tx: UserManagementTx) => Promise<T>,
  ): Promise<T> {
    try {
      return await runWithTenant(
        this.prisma,
        tenantId,
        async (tx) => {
          const lockKey = employeeAdministrationLockKey(tenantId);
          await tx.$queryRaw`SELECT set_config('lock_timeout', ${this.lockTimeout}, true)`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`;

          return work(new PrismaUserManagementTx(tx, tenantId));
        },
        EXCLUSIVE_TRANSACTION_OPTIONS,
      );
    } catch (error) {
      if (isLockTimeout(error)) {
        throw new EmployeeAdministrationBusyError();
      }
      throw error;
    }
  }
}
