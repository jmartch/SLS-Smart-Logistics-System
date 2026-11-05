import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaZoneCatalogAdapter } from '../infrastructure/prisma-zone-catalog.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';

function createFixture() {
  const executeRawUnsafe = jest.fn().mockResolvedValue(1);
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const create = jest.fn();

  const transaction = {
    $executeRawUnsafe: executeRawUnsafe,
    zone: {
      findMany,
      findUnique,
      create,
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  return {
    executeRawUnsafe,
    findMany,
    findUnique,
    create,
    adapter: new PrismaZoneCatalogAdapter(prisma),
  };
}

describe('PrismaZoneCatalogAdapter', () => {
  describe('listByTenant', () => {
    it('sets the tenant session and retrieves zones ordered by code and id', async () => {
      const { executeRawUnsafe, findMany, adapter } = createFixture();
      const rows = [
        {
          id: ZONE_ID,
          tenantId: TENANT_ID,
          code: 'NORTE',
          name: 'Zona norte',
        },
      ];
      findMany.mockResolvedValue(rows);

      const result = await adapter.listByTenant(TENANT_ID);

      expect(result).toEqual(rows);
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
        },
      });
      expect(executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
        findMany.mock.invocationCallOrder[0],
      );
    });
  });

  describe('findByTenant', () => {
    it('queries by compound tenantId and id within tenant session', async () => {
      const { executeRawUnsafe, findUnique, adapter } = createFixture();
      const row = {
        id: ZONE_ID,
        tenantId: TENANT_ID,
        code: 'NORTE',
        name: 'Zona norte',
      };
      findUnique.mockResolvedValue(row);

      const result = await adapter.findByTenant(TENANT_ID, ZONE_ID);

      expect(result).toEqual(row);
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: ZONE_ID,
          },
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
        },
      });
    });

    it('returns null when the zone is not found', async () => {
      const { findUnique, adapter } = createFixture();
      findUnique.mockResolvedValue(null);

      const result = await adapter.findByTenant(TENANT_ID, ZONE_ID);

      expect(result).toBeNull();
    });
  });

  describe('createByTenant', () => {
    it('creates a zone within tenant session and returns success result', async () => {
      const { executeRawUnsafe, create, adapter } = createFixture();
      const createdRow = {
        id: ZONE_ID,
        tenantId: TENANT_ID,
        code: 'NORTE',
        name: 'Zona norte',
      };
      create.mockResolvedValue(createdRow);

      const result = await adapter.createByTenant(TENANT_ID, {
        code: 'NORTE',
        name: 'Zona norte',
      });

      expect(result).toEqual({
        ok: true,
        zone: createdRow,
      });
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          code: 'NORTE',
          name: 'Zona norte',
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
        },
      });
    });

    it('translates P2002 unique constraint error to CATALOG_CODE_CONFLICT', async () => {
      const { create, adapter } = createFixture();
      const prismaConflict = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`tenantId`,`code`)',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      );
      create.mockRejectedValue(prismaConflict);

      const result = await adapter.createByTenant(TENANT_ID, {
        code: 'NORTE',
        name: 'Zona norte',
      });

      expect(result).toEqual({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });
    });

    it('propagates other errors without modification', async () => {
      const { create, adapter } = createFixture();
      const genericError = new Error('Database server connection lost');
      create.mockRejectedValue(genericError);

      await expect(
        adapter.createByTenant(TENANT_ID, {
          code: 'NORTE',
          name: 'Zona norte',
        }),
      ).rejects.toBe(genericError);
    });
  });
});
