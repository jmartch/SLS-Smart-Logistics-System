import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaPlatformAdminLookup } from './prisma-platform-admin-lookup.repository';

// Runs against the real database through the runtime role (sls_app has only
// SELECT on PlatformAdmin). Fixtures are created through the admin connection
// and only the ids created here are ever deleted.
describe('PrismaPlatformAdminLookup', () => {
  jest.setTimeout(30000);

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const prisma = new PrismaService();
  const lookup = new PrismaPlatformAdminLookup(prisma);
  const runId = randomUUID().slice(0, 8);
  const createdIds: string[] = [];
  const ids: Record<'ACTIVE' | 'INACTIVE' | 'SUSPENDED', string> = {
    ACTIVE: '',
    INACTIVE: '',
    SUSPENDED: '',
  };

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

    for (const status of ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const) {
      const row = await admin.platformAdmin.create({
        data: {
          email: `${status.toLowerCase()}-${runId}@platform-lookup.test`,
          passwordHash: 'not-a-real-hash',
          status,
        },
      });
      createdIds.push(row.id);
      ids[status] = row.id;
    }
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

    if (createdIds.length > 0) {
      await step(() =>
        admin.platformAdmin.deleteMany({ where: { id: { in: createdIds } } }),
      );
    }
    await step(() => admin.$disconnect());
    await step(() => prisma.onModuleDestroy());

    if (failures.length > 0) {
      throw failures[0];
    }
  }, 30000);

  describe('isActive', () => {
    it('is true for an ACTIVE platform admin', async () => {
      await expect(lookup.isActive(ids.ACTIVE)).resolves.toBe(true);
    });

    it.each(['INACTIVE', 'SUSPENDED'] as const)(
      'is false for a %s platform admin',
      async (status) => {
        await expect(lookup.isActive(ids[status])).resolves.toBe(false);
      },
    );

    it('is false for an unknown id', async () => {
      await expect(lookup.isActive(randomUUID())).resolves.toBe(false);
    });

    it('reads the status fresh on every call', async () => {
      const row = await admin.platformAdmin.create({
        data: {
          email: `flip-${runId}@platform-lookup.test`,
          passwordHash: 'not-a-real-hash',
        },
      });
      createdIds.push(row.id);

      await expect(lookup.isActive(row.id)).resolves.toBe(true);
      await admin.platformAdmin.update({
        where: { id: row.id },
        data: { status: 'INACTIVE' },
      });
      await expect(lookup.isActive(row.id)).resolves.toBe(false);
    });
  });

  describe('findEmail', () => {
    it('returns the email of an existing platform admin', async () => {
      await expect(lookup.findEmail(ids.ACTIVE)).resolves.toBe(
        `active-${runId}@platform-lookup.test`,
      );
    });

    it('returns null for an unknown id', async () => {
      await expect(lookup.findEmail(randomUUID())).resolves.toBeNull();
    });
  });
});
