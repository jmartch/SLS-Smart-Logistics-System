import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaVehicleQueryAdapter } from '../infrastructure/prisma-vehicle-query.adapter';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const VEHICLE = '20000000-0000-4000-8000-000000000001';

function fixture() {
  const count = jest.fn().mockResolvedValue(1);
  const findMany = jest.fn().mockResolvedValue([
    {
      id: VEHICLE,
      tenantId: TENANT_A,
      plate: 'ABC123',
      status: 'ACTIVE',
      maxWeightKg: new Prisma.Decimal('10.001'),
      maxVolumeM3: new Prisma.Decimal('1.000001'),
    },
  ]);
  const queryRaw = jest.fn().mockResolvedValue([
    {
      vehicleId: VEHICLE,
      weightKg: new Prisma.Decimal('0.002'),
      volumeM3: new Prisma.Decimal('0.000002'),
    },
  ]);
  const tx = {
    vehicle: { count, findMany },
    $queryRaw: queryRaw,
    $executeRawUnsafe: jest.fn(),
  };
  const transaction = jest.fn(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  const adapter = new PrismaVehicleQueryAdapter({
    $transaction: transaction,
  } as unknown as PrismaService);
  return { adapter, count, findMany, queryRaw, transaction, tx };
}

describe('PrismaVehicleQueryAdapter', () => {
  it('returns exact decimal capacity and scopes every query to the authenticated tenant', async () => {
    const { adapter, count, findMany, queryRaw, transaction, tx } = fixture();
    const result = await adapter.listByTenant(TENANT_A, {
      page: 2,
      pageSize: 5,
      search: 'ABC',
      status: 'ACTIVE',
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.tenant_id = '${TENANT_A}'`,
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    const where = {
      tenantId: TENANT_A,
      status: 'ACTIVE',
      plate: { contains: 'ABC', mode: 'insensitive' },
    };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 5, take: 5 }),
    );
    const sql = queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.values).toEqual([TENANT_A, VEHICLE]);
    expect(sql.text).toContain("a.status = 'ACTIVE'");
    expect(sql.text).toContain('p."tenantId" = a."tenantId"');
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 5,
      items: [
        {
          assignedWeightKg: '0.002',
          assignedVolumeM3: '0.000002',
          remainingWeightKg: '9.999',
          remainingVolumeM3: '0.999999',
        },
      ],
    });
  });

  it('shows full capacity when there are no active assignments', async () => {
    const { adapter, queryRaw } = fixture();
    queryRaw.mockResolvedValue([]);
    const result = await adapter.listByTenant(TENANT_A, {
      page: 1,
      pageSize: 20,
    });
    expect(result.items[0]).toMatchObject({
      assignedWeightKg: '0.000',
      assignedVolumeM3: '0.000000',
      remainingWeightKg: '10.001',
      remainingVolumeM3: '1.000001',
    });
  });

  it('preserves the total on an empty page without querying unrelated assignments', async () => {
    const { adapter, findMany, queryRaw } = fixture();
    findMany.mockResolvedValue([]);
    await expect(
      adapter.listByTenant(TENANT_A, { page: 2, pageSize: 20 }),
    ).resolves.toEqual({ items: [], total: 1, page: 2, pageSize: 20 });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an invalid tenant before accessing persistence', async () => {
    const { adapter, transaction } = fixture();
    await expect(
      adapter.listByTenant('invalid', { page: 1, pageSize: 20 }),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
