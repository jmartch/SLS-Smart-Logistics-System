import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaSectorCatalogAdapter } from '../infrastructure/prisma-sector-catalog.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const SECTOR_ID = '30000000-0000-4000-8000-000000000001';

function createFixture() {
  const executeRawUnsafe = jest.fn().mockResolvedValue(1);
  const zoneFindUnique = jest.fn();
  const sectorFindMany = jest.fn();
  const sectorFindUnique = jest.fn();
  const sectorCreate = jest.fn();

  const transaction = {
    $executeRawUnsafe: executeRawUnsafe,
    zone: {
      findUnique: zoneFindUnique,
    },
    sector: {
      findMany: sectorFindMany,
      findUnique: sectorFindUnique,
      create: sectorCreate,
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
    zoneFindUnique,
    sectorFindMany,
    sectorFindUnique,
    sectorCreate,
    adapter: new PrismaSectorCatalogAdapter(prisma),
  };
}

describe('PrismaSectorCatalogAdapter', () => {
  describe('listByZone', () => {
    it('sets the tenant session and retrieves sectors ordered by code and id', async () => {
      const { executeRawUnsafe, sectorFindMany, adapter } = createFixture();
      const rows = [
        {
          id: SECTOR_ID,
          tenantId: TENANT_ID,
          zoneId: ZONE_ID,
          code: 'SEC-A',
          name: 'Sector A',
        },
      ];
      sectorFindMany.mockResolvedValue(rows);

      const result = await adapter.listByZone(TENANT_ID, ZONE_ID);

      expect(result).toEqual(rows);
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(sectorFindMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, zoneId: ZONE_ID },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          zoneId: true,
          code: true,
          name: true,
        },
      });
      expect(executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
        sectorFindMany.mock.invocationCallOrder[0],
      );
    });
  });

  describe('findByTenant', () => {
    it('queries by compound tenantId and id within tenant session', async () => {
      const { executeRawUnsafe, sectorFindUnique, adapter } = createFixture();
      const row = {
        id: SECTOR_ID,
        tenantId: TENANT_ID,
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      };
      sectorFindUnique.mockResolvedValue(row);

      const result = await adapter.findByTenant(TENANT_ID, SECTOR_ID);

      expect(result).toEqual(row);
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(sectorFindUnique).toHaveBeenCalledWith({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: SECTOR_ID,
          },
        },
        select: {
          id: true,
          tenantId: true,
          zoneId: true,
          code: true,
          name: true,
        },
      });
    });

    it('returns null when the sector is not found', async () => {
      const { sectorFindUnique, adapter } = createFixture();
      sectorFindUnique.mockResolvedValue(null);

      const result = await adapter.findByTenant(TENANT_ID, SECTOR_ID);

      expect(result).toBeNull();
    });
  });

  describe('createByTenant', () => {
    it('creates a sector when the parent zone exists and returns success', async () => {
      const { executeRawUnsafe, zoneFindUnique, sectorCreate, adapter } =
        createFixture();
      zoneFindUnique.mockResolvedValue({ id: ZONE_ID });
      const createdRow = {
        id: SECTOR_ID,
        tenantId: TENANT_ID,
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      };
      sectorCreate.mockResolvedValue(createdRow);

      const result = await adapter.createByTenant(TENANT_ID, {
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      });

      expect(result).toEqual({
        ok: true,
        sector: createdRow,
      });
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(zoneFindUnique).toHaveBeenCalledWith({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: ZONE_ID,
          },
        },
        select: { id: true },
      });
      expect(sectorCreate).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          zoneId: ZONE_ID,
          code: 'SEC-A',
          name: 'Sector A',
        },
        select: {
          id: true,
          tenantId: true,
          zoneId: true,
          code: true,
          name: true,
        },
      });
    });

    it('returns ZONE_NOT_FOUND without creating when parent zone does not exist', async () => {
      const { zoneFindUnique, sectorCreate, adapter } = createFixture();
      zoneFindUnique.mockResolvedValue(null);

      const result = await adapter.createByTenant(TENANT_ID, {
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      });

      expect(result).toEqual({
        ok: false,
        code: 'ZONE_NOT_FOUND',
      });
      expect(sectorCreate).not.toHaveBeenCalled();
    });

    it('translates P2002 unique constraint error to CATALOG_CODE_CONFLICT', async () => {
      const { zoneFindUnique, sectorCreate, adapter } = createFixture();
      zoneFindUnique.mockResolvedValue({ id: ZONE_ID });
      const prismaConflict = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`zoneId`,`code`)',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      );
      sectorCreate.mockRejectedValue(prismaConflict);

      const result = await adapter.createByTenant(TENANT_ID, {
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      });

      expect(result).toEqual({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });
    });

    it('propagates other errors without modification', async () => {
      const { zoneFindUnique, sectorCreate, adapter } = createFixture();
      zoneFindUnique.mockResolvedValue({ id: ZONE_ID });
      const genericError = new Error('Database server connection lost');
      sectorCreate.mockRejectedValue(genericError);

      await expect(
        adapter.createByTenant(TENANT_ID, {
          zoneId: ZONE_ID,
          code: 'SEC-A',
          name: 'Sector A',
        }),
      ).rejects.toBe(genericError);
    });
  });
});
