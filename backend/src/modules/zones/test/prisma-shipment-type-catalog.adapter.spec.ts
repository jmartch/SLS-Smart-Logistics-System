import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaShipmentTypeCatalogAdapter } from '../infrastructure/prisma-shipment-type-catalog.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SHIPMENT_TYPE_ID = '40000000-0000-4000-8000-000000000001';

function createFixture() {
  const executeRawUnsafe = jest.fn().mockResolvedValue(1);
  const shipmentTypeFindMany = jest.fn();
  const shipmentTypeFindUnique = jest.fn();
  const shipmentTypeCreate = jest.fn();

  const transaction = {
    $executeRawUnsafe: executeRawUnsafe,
    shipmentType: {
      findMany: shipmentTypeFindMany,
      findUnique: shipmentTypeFindUnique,
      create: shipmentTypeCreate,
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
    shipmentTypeFindMany,
    shipmentTypeFindUnique,
    shipmentTypeCreate,
    adapter: new PrismaShipmentTypeCatalogAdapter(prisma),
  };
}

describe('PrismaShipmentTypeCatalogAdapter', () => {
  describe('listByTenant', () => {
    it('sets the tenant session and retrieves active shipment types by default ordered by code and id', async () => {
      const { executeRawUnsafe, shipmentTypeFindMany, adapter } =
        createFixture();
      const rows = [
        {
          id: SHIPMENT_TYPE_ID,
          tenantId: TENANT_ID,
          code: 'EXPRESS',
          name: 'Envío Express',
          active: true,
        },
      ];
      shipmentTypeFindMany.mockResolvedValue(rows);

      const result = await adapter.listByTenant(TENANT_ID);

      expect(result).toEqual(rows);
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(shipmentTypeFindMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, active: true },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          active: true,
        },
      });
      expect(executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
        shipmentTypeFindMany.mock.invocationCallOrder[0],
      );
    });

    it('includes inactive shipment types when includeInactive filter is true', async () => {
      const { executeRawUnsafe, shipmentTypeFindMany, adapter } =
        createFixture();
      const rows = [
        {
          id: SHIPMENT_TYPE_ID,
          tenantId: TENANT_ID,
          code: 'EXPRESS',
          name: 'Envío Express',
          active: false,
        },
      ];
      shipmentTypeFindMany.mockResolvedValue(rows);

      const result = await adapter.listByTenant(TENANT_ID, {
        includeInactive: true,
      });

      expect(result).toEqual(rows);
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(shipmentTypeFindMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          active: true,
        },
      });
    });
  });

  describe('findByTenant', () => {
    it('queries by compound tenantId and id within tenant session', async () => {
      const { executeRawUnsafe, shipmentTypeFindUnique, adapter } =
        createFixture();
      const row = {
        id: SHIPMENT_TYPE_ID,
        tenantId: TENANT_ID,
        code: 'EXPRESS',
        name: 'Envío Express',
        active: true,
      };
      shipmentTypeFindUnique.mockResolvedValue(row);

      const result = await adapter.findByTenant(TENANT_ID, SHIPMENT_TYPE_ID);

      expect(result).toEqual(row);
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(shipmentTypeFindUnique).toHaveBeenCalledWith({
        where: {
          tenantId_id: {
            tenantId: TENANT_ID,
            id: SHIPMENT_TYPE_ID,
          },
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          active: true,
        },
      });
      expect(executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
        shipmentTypeFindUnique.mock.invocationCallOrder[0],
      );
    });

    it('returns null when the shipment type is not found', async () => {
      const { shipmentTypeFindUnique, adapter } = createFixture();
      shipmentTypeFindUnique.mockResolvedValue(null);

      const result = await adapter.findByTenant(TENANT_ID, SHIPMENT_TYPE_ID);

      expect(result).toBeNull();
    });
  });

  describe('createByTenant', () => {
    it('sets the tenant session and creates a shipment type with active defaulting to true', async () => {
      const { executeRawUnsafe, shipmentTypeCreate, adapter } = createFixture();
      const createdRow = {
        id: SHIPMENT_TYPE_ID,
        tenantId: TENANT_ID,
        code: 'EXPRESS',
        name: 'Envío Express',
        active: true,
      };
      shipmentTypeCreate.mockResolvedValue(createdRow);

      const result = await adapter.createByTenant(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
      });

      expect(result).toEqual({
        ok: true,
        shipmentType: createdRow,
      });
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(shipmentTypeCreate).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          code: 'EXPRESS',
          name: 'Envío Express',
          active: true,
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          active: true,
        },
      });
      expect(executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
        shipmentTypeCreate.mock.invocationCallOrder[0],
      );
    });

    it('creates a shipment type with explicit active false', async () => {
      const { shipmentTypeCreate, adapter } = createFixture();
      const createdRow = {
        id: SHIPMENT_TYPE_ID,
        tenantId: TENANT_ID,
        code: 'EXPRESS',
        name: 'Envío Express',
        active: false,
      };
      shipmentTypeCreate.mockResolvedValue(createdRow);

      const result = await adapter.createByTenant(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
        active: false,
      });

      expect(result).toEqual({
        ok: true,
        shipmentType: createdRow,
      });
      expect(shipmentTypeCreate).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          code: 'EXPRESS',
          name: 'Envío Express',
          active: false,
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          active: true,
        },
      });
    });

    it('returns CATALOG_CODE_CONFLICT when Prisma reports a P2002 unique constraint violation', async () => {
      const { shipmentTypeCreate, adapter } = createFixture();
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (tenantId, code)',
        {
          code: 'P2002',
          clientVersion: 'test',
        },
      );
      shipmentTypeCreate.mockRejectedValue(p2002Error);

      const result = await adapter.createByTenant(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
      });

      expect(result).toEqual({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });
    });

    it('propagates the original infrastructure error when Prisma fails unexpectedly', async () => {
      const { shipmentTypeCreate, adapter } = createFixture();
      const dbError = new Error('Database connection lost');
      shipmentTypeCreate.mockRejectedValue(dbError);

      await expect(
        adapter.createByTenant(TENANT_ID, {
          code: 'EXPRESS',
          name: 'Envío Express',
        }),
      ).rejects.toThrow('Database connection lost');
    });
  });
});
