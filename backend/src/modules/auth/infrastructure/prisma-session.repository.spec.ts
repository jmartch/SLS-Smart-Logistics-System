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
  const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);
  const newHash = () => hashSessionToken(`raw-${randomUUID()}`);

  beforeAll(async () => {
    await admin.$connect();
    await prisma.onModuleInit();

    const tenant = await admin.tenant.create({
      data: { name: `session-repo-spec-${runId}` },
    });
    tenantId = tenant.id;
    const user = await admin.user.create({
      data: {
        tenantId,
        email: `user-${runId}@session-repo.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    const otherUser = await admin.user.create({
      data: {
        tenantId,
        email: `other-${runId}@session-repo.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    userId = user.id;
    otherUserId = otherUser.id;
    const platformAdmin = await admin.platformAdmin.create({
      data: {
        email: `admin-${runId}@session-repo.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    platformAdminId = platformAdmin.id;
  }, 30000);

  afterAll(async () => {
    // Delete only rows created by this spec, children before parents.
    await admin.session.deleteMany({
      where: {
        OR: [{ tenantId }, { platformAdminId }],
      },
    });
    await admin.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await admin.platformAdmin.deleteMany({ where: { id: platformAdminId } });
    await admin.tenant.deleteMany({ where: { id: tenantId } });
    await admin.$disconnect();
    await prisma.onModuleDestroy();
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
});
