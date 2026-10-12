import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { hashSessionToken } from '../domain/session-token';
import { PrismaSessionRepository } from './prisma-session.repository';

// Runs against the real database: the behavior under test is the actual SQL
// (Session has no RLS, so the repository must not depend on tenant GUCs).
// Fixtures are created through the admin connection because sls_app cannot
// create Tenant, User, or PlatformAdmin rows.
describe('PrismaSessionRepository', () => {
  jest.setTimeout(30000);

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const prisma = new PrismaService();
  const repository = new PrismaSessionRepository(prisma);
  const runId = randomUUID();

  let tenantId: string;
  let userId: string;
  let otherUserId: string;
  let platformAdminId: string;
  // Ids actually created by this spec. afterAll builds its filters only from
  // these: Prisma drops `undefined` filters, so an `undefined` id would turn a
  // scoped deleteMany into a delete of every row in the shared database.
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdPlatformAdminIds: string[] = [];
  const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);
  const newHash = () => hashSessionToken(`raw-${randomUUID()}`);

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

    const tenant = await admin.tenant.create({
      data: {
        name: `session-repo-spec-${runId}`,
        slug: `session-repo-spec-${runId}`,
      },
    });
    createdTenantIds.push(tenant.id);
    tenantId = tenant.id;
    const user = await admin.user.create({
      data: {
        tenantId,
        email: `user-${runId}@session-repo.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    createdUserIds.push(user.id);
    const otherUser = await admin.user.create({
      data: {
        tenantId,
        email: `other-${runId}@session-repo.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    createdUserIds.push(otherUser.id);
    userId = user.id;
    otherUserId = otherUser.id;
    const platformAdmin = await admin.platformAdmin.create({
      data: {
        email: `admin-${runId}@session-repo.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    createdPlatformAdminIds.push(platformAdmin.id);
    platformAdminId = platformAdmin.id;
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
      const owners: Array<
        { tenantId: { in: string[] } } | { platformAdminId: { in: string[] } }
      > = [];
      if (createdTenantIds.length > 0) {
        owners.push({ tenantId: { in: createdTenantIds } });
      }
      if (createdPlatformAdminIds.length > 0) {
        owners.push({ platformAdminId: { in: createdPlatformAdminIds } });
      }
      if (owners.length > 0) {
        await admin.session.deleteMany({ where: { OR: owners } });
      }
    });
    await step(async () => {
      if (createdUserIds.length > 0) {
        await admin.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    });
    await step(async () => {
      if (createdPlatformAdminIds.length > 0) {
        await admin.platformAdmin.deleteMany({
          where: { id: { in: createdPlatformAdminIds } },
        });
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

  it('creates a tenant-user session and finds it by token hash', async () => {
    const tokenHash = newHash();
    const expiresAt = futureDate();

    const created = await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      tokenHash,
      expiresAt,
    );
    const found = await repository.findActiveByTokenHash(tokenHash);

    expect(found).toEqual({
      id: created.id,
      actor: { actorType: 'TENANT_USER', tenantId, userId },
      expiresAt,
    });
  });

  it('creates a platform-admin session and finds it by token hash', async () => {
    const tokenHash = newHash();

    const created = await repository.create(
      { actorType: 'PLATFORM_ADMIN', platformAdminId },
      tokenHash,
      futureDate(),
    );
    const found = await repository.findActiveByTokenHash(tokenHash);

    expect(found?.id).toBe(created.id);
    expect(found?.actor).toEqual({
      actorType: 'PLATFORM_ADMIN',
      platformAdminId,
    });
  });

  it('returns null for an unknown token hash', async () => {
    await expect(
      repository.findActiveByTokenHash(newHash()),
    ).resolves.toBeNull();
  });

  it('does not return an expired session', async () => {
    const tokenHash = newHash();
    await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      tokenHash,
      new Date(Date.now() - 1000),
    );

    await expect(
      repository.findActiveByTokenHash(tokenHash),
    ).resolves.toBeNull();
  });

  it('does not return a revoked session', async () => {
    const tokenHash = newHash();
    const created = await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      tokenHash,
      futureDate(),
    );

    await repository.revoke(created.id);

    await expect(
      repository.findActiveByTokenHash(tokenHash),
    ).resolves.toBeNull();
  });

  it('touch extends expiry and records last use', async () => {
    const tokenHash = newHash();
    const created = await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      tokenHash,
      futureDate(),
    );
    const extended = new Date(Date.now() + 3 * 60 * 60 * 1000);

    await repository.touch(created.id, extended);

    const found = await repository.findActiveByTokenHash(tokenHash);
    expect(found?.expiresAt).toEqual(extended);
  });

  it('revokeAllForUser revokes only that user sessions', async () => {
    const targetHashA = newHash();
    const targetHashB = newHash();
    const otherHash = newHash();
    const adminHash = newHash();
    await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      targetHashA,
      futureDate(),
    );
    await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      targetHashB,
      futureDate(),
    );
    await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId: otherUserId },
      otherHash,
      futureDate(),
    );
    await repository.create(
      { actorType: 'PLATFORM_ADMIN', platformAdminId },
      adminHash,
      futureDate(),
    );

    await repository.revokeAllForUser(tenantId, userId);

    await expect(
      repository.findActiveByTokenHash(targetHashA),
    ).resolves.toBeNull();
    await expect(
      repository.findActiveByTokenHash(targetHashB),
    ).resolves.toBeNull();
    await expect(
      repository.findActiveByTokenHash(otherHash),
    ).resolves.not.toBeNull();
    await expect(
      repository.findActiveByTokenHash(adminHash),
    ).resolves.not.toBeNull();
  });

  it('revoke is idempotent and keeps the first revokedAt', async () => {
    const created = await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      newHash(),
      futureDate(),
    );

    await repository.revoke(created.id);
    const first = await admin.session.findUniqueOrThrow({
      where: { id: created.id },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await expect(repository.revoke(created.id)).resolves.toBeUndefined();
    const second = await admin.session.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(first.revokedAt).not.toBeNull();
    expect(second.revokedAt).toEqual(first.revokedAt);
  });

  it('revoke and touch on a missing session do not throw', async () => {
    const missingId = randomUUID();

    await expect(repository.revoke(missingId)).resolves.toBeUndefined();
    await expect(
      repository.touch(missingId, futureDate()),
    ).resolves.toBeUndefined();
  });

  it('touch does not extend a revoked session', async () => {
    const created = await repository.create(
      { actorType: 'TENANT_USER', tenantId, userId },
      newHash(),
      futureDate(),
    );
    await repository.revoke(created.id);
    const before = await admin.session.findUniqueOrThrow({
      where: { id: created.id },
    });

    await repository.touch(
      created.id,
      new Date(Date.now() + 5 * 60 * 60 * 1000),
    );

    const after = await admin.session.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.expiresAt).toEqual(before.expiresAt);
    expect(after.lastUsedAt).toEqual(before.lastUsedAt);
  });

  it('enforces Session_actor_coherence_check at the database level against incoherent actor rows', async () => {
    // 1. TENANT_USER missing userId/tenantId
    await expect(
      admin.session.create({
        data: {
          tokenHash: newHash(),
          actorType: 'TENANT_USER',
          tenantId: null,
          userId: null,
          platformAdminId: null,
          expiresAt: futureDate(),
        },
      }),
    ).rejects.toThrow();

    // 2. TENANT_USER carrying platformAdminId simultaneously
    await expect(
      admin.session.create({
        data: {
          tokenHash: newHash(),
          actorType: 'TENANT_USER',
          tenantId,
          userId,
          platformAdminId,
          expiresAt: futureDate(),
        },
      }),
    ).rejects.toThrow();

    // 3. PLATFORM_ADMIN missing platformAdminId or carrying tenantId
    await expect(
      admin.session.create({
        data: {
          tokenHash: newHash(),
          actorType: 'PLATFORM_ADMIN',
          tenantId,
          userId: null,
          platformAdminId,
          expiresAt: futureDate(),
        },
      }),
    ).rejects.toThrow();
  });
});
