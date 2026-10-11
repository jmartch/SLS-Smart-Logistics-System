import {
  EmployeeEmailAlreadyExistsError,
  type EmployeeAuditEntry,
  type EmployeeRecord,
  type EmployeeStatus,
  type RoleRecord,
} from '../../domain/employee';
import {
  UserManagementRepository,
  type UserManagementTx,
} from '../../domain/user-management.repository';
import {
  SessionRepository,
  type SessionRecord,
} from '../../../auth/domain/session.repository';

interface FakeUser {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  status: EmployeeStatus;
  roleIds: string[];
}

interface FakeRole {
  id: string;
  tenantId: string;
  name: string;
  permissions: ReadonlySet<string>;
}

export interface FakeAuditEntry extends EmployeeAuditEntry {
  readonly tenantId: string;
}

function toRecord(user: FakeUser): EmployeeRecord {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    roleIds: [...user.roleIds],
  };
}

// In-memory stand-in for the Prisma adapter. runExclusive mirrors the real
// contract: work for one tenant runs strictly one at a time, writes are rolled
// back when the work throws, and the transaction-bound repository refuses to
// be used once its scope has ended (so a service cannot read or write outside
// the exclusive section). `events` records commits so tests can check that
// side effects such as session revocation happen after the commit.
export class InMemoryUserManagementRepository extends UserManagementRepository {
  readonly users = new Map<string, FakeUser>();
  readonly roles = new Map<string, FakeRole>();
  readonly auditEntries: FakeAuditEntry[] = [];
  readonly events: string[] = [];
  readonly exclusiveTenantIds: string[] = [];
  private nextId = 1;
  private readonly queues = new Map<string, Promise<unknown>>();

  addRole(
    tenantId: string,
    permissions: readonly string[],
    name?: string,
  ): string {
    const id = `role-${this.nextId++}`;
    this.roles.set(id, {
      id,
      tenantId,
      name: name ?? id,
      permissions: new Set(permissions),
    });
    return id;
  }

  addUser(
    tenantId: string,
    options: { email?: string; status?: EmployeeStatus; roleIds?: string[] },
  ): string {
    const id = `user-${this.nextId++}`;
    this.users.set(id, {
      id,
      tenantId,
      email: options.email ?? `${id}@fake.test`,
      passwordHash: 'fake-hash',
      status: options.status ?? 'ACTIVE',
      roleIds: [...(options.roleIds ?? [])],
    });
    return id;
  }

  user(id: string): FakeUser {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`fake user ${id} does not exist`);
    }
    return user;
  }

  list(tenantId: string): Promise<readonly EmployeeRecord[]> {
    return Promise.resolve(
      [...this.users.values()]
        .filter((user) => user.tenantId === tenantId)
        .sort((a, b) => a.email.localeCompare(b.email))
        .map(toRecord),
    );
  }

  listRoles(tenantId: string): Promise<readonly RoleRecord[]> {
    return Promise.resolve(
      [...this.roles.values()]
        .filter((role) => role.tenantId === tenantId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((role) => ({
          id: role.id,
          name: role.name,
          permissions: [...role.permissions].sort(),
        })),
    );
  }

  runExclusive<T>(
    tenantId: string,
    work: (tx: UserManagementTx) => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(tenantId) ?? Promise.resolve();
    const run = async (): Promise<T> => {
      this.exclusiveTenantIds.push(tenantId);
      const snapshot = new Map(
        [...this.users].map(([id, user]) => [
          id,
          { ...user, roleIds: [...user.roleIds] },
        ]),
      );
      const auditSnapshot = [...this.auditEntries];
      const scope = { open: true };
      try {
        const result = await work(this.transactionFor(tenantId, scope));
        this.events.push('commit');
        return result;
      } catch (error) {
        this.users.clear();
        for (const [id, user] of snapshot) {
          this.users.set(id, user);
        }
        this.auditEntries.length = 0;
        this.auditEntries.push(...auditSnapshot);
        this.events.push('rollback');
        throw error;
      } finally {
        scope.open = false;
      }
    };
    const result = previous.then(run, run);
    this.queues.set(
      tenantId,
      result.catch(() => undefined),
    );
    return result;
  }

  private transactionFor(
    tenantId: string,
    scope: { open: boolean },
  ): UserManagementTx {
    const ensureOpen = () => {
      if (!scope.open) {
        throw new Error('transaction-bound repository used after its scope');
      }
    };
    // Yields between steps so concurrent callers would interleave if the
    // exclusive section did not serialize them.
    const step = async () => {
      ensureOpen();
      await new Promise((resolve) => setImmediate(resolve));
    };
    const ownUser = (userId: string) => {
      const user = this.users.get(userId);
      return user && user.tenantId === tenantId ? user : undefined;
    };
    const grants = (roleIds: readonly string[], code: string) =>
      roleIds.some((roleId) => {
        const role = this.roles.get(roleId);
        return role?.tenantId === tenantId && role.permissions.has(code);
      });

    return {
      createUser: async (email, passwordHash, roleIds) => {
        await step();
        const duplicate = [...this.users.values()].some(
          (user) => user.tenantId === tenantId && user.email === email,
        );
        if (duplicate) {
          throw new EmployeeEmailAlreadyExistsError();
        }
        const id = `user-${this.nextId++}`;
        const user: FakeUser = {
          id,
          tenantId,
          email,
          passwordHash,
          status: 'ACTIVE',
          roleIds: [...roleIds],
        };
        this.users.set(id, user);
        return toRecord(user);
      },
      userHasPermission: async (userId, code) => {
        await step();
        const user = ownUser(userId);
        return user?.status === 'ACTIVE' && grants(user.roleIds, code);
      },
      countActiveUsersWithPermission: async (code) => {
        await step();
        return [...this.users.values()].filter(
          (user) =>
            user.tenantId === tenantId &&
            user.status === 'ACTIVE' &&
            grants(user.roleIds, code),
        ).length;
      },
      rolesBelongToTenant: async (roleIds) => {
        await step();
        return roleIds.every(
          (roleId) => this.roles.get(roleId)?.tenantId === tenantId,
        );
      },
      roleIdsGrantPermission: async (roleIds, code) => {
        await step();
        return grants(roleIds, code);
      },
      setStatus: async (userId, status) => {
        await step();
        const user = ownUser(userId);
        if (!user) {
          return false;
        }
        user.status = status;
        return true;
      },
      setRoles: async (userId, roleIds) => {
        await step();
        const user = ownUser(userId);
        if (!user) {
          return false;
        }
        user.roleIds = [...roleIds];
        return true;
      },
      recordAudit: async (entry) => {
        await step();
        this.auditEntries.push({
          tenantId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          targetUserId: entry.targetUserId,
          metadata: { ...entry.metadata },
        });
      },
    };
  }
}

// Records revocations into the repository's event log so tests can assert
// they happen after the commit.
export class RecordingSessionRepository extends SessionRepository {
  readonly revokedUsers: { tenantId: string; userId: string }[] = [];

  constructor(private readonly events: string[]) {
    super();
  }

  create(): Promise<SessionRecord> {
    return Promise.reject(new Error('not used by these services'));
  }

  findActiveByTokenHash(): Promise<SessionRecord | null> {
    return Promise.reject(new Error('not used by these services'));
  }

  touch(): Promise<void> {
    return Promise.reject(new Error('not used by these services'));
  }

  revoke(): Promise<void> {
    return Promise.reject(new Error('not used by these services'));
  }

  revokeAllForUser(tenantId: string, userId: string): Promise<void> {
    this.revokedUsers.push({ tenantId, userId });
    this.events.push(`revoke:${userId}`);
    return Promise.resolve();
  }
}
