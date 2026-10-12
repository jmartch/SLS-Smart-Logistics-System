import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaVehicleAdapter } from '../infrastructure/prisma-vehicle.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const VEHICLE_ID = '20000000-0000-4000-8000-000000000001';

function createFixture() {
  const executeRawUnsafe = jest.fn().mockResolvedValue(1);
  const create = jest.fn();
  const transaction = {
    $executeRawUnsafe: executeRawUnsafe,
    vehicle: { create },
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  return {
    create,
    executeRawUnsafe,
    adapter: new PrismaVehicleAdapter(prisma),
  };
}

describe('PrismaVehicleAdapter', () => {
  const data = { plate: 'ABC123', maxWeightKg: '1200.5', maxVolumeM3: '8.25' };

  it('sets the tenant session and creates the vehicle scoped to that tenant', async () => {
    const { create, executeRawUnsafe, adapter } = createFixture();
    create.mockResolvedValue({
      id: VEHICLE_ID,
      tenantId: TENANT_ID,
      plate: 'ABC123',
      maxWeightKg: '1200.5',
      maxVolumeM3: '8.25',
      status: 'ACTIVE',
    });

    const result = await adapter.createByTenant(TENANT_ID, data);

    expect(executeRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: TENANT_ID,
          plate: 'ABC123',
          maxWeightKg: '1200.5',
          maxVolumeM3: '8.25',
        },
      }),
    );
    expect(result).toEqual({
      ok: true,
      vehicle: {
        id: VEHICLE_ID,
        tenantId: TENANT_ID,
        plate: 'ABC123',
        maxWeightKg: '1200.5',
        maxVolumeM3: '8.25',
        status: 'ACTIVE',
      },
    });
  });

  it('serializes decimal values returned by Prisma as strings', async () => {
    const { create, adapter } = createFixture();
    create.mockResolvedValue({
      id: VEHICLE_ID,
      tenantId: TENANT_ID,
      plate: 'ABC123',
      maxWeightKg: new Prisma.Decimal('1200.5'),
      maxVolumeM3: new Prisma.Decimal('8.25'),
      status: 'ACTIVE',
    });

    const result = await adapter.createByTenant(TENANT_ID, data);

    expect(result).toMatchObject({
      ok: true,
      vehicle: { maxWeightKg: '1200.5', maxVolumeM3: '8.25' },
    });
  });

  it('translates P2002 into VEHICLE_PLATE_CONFLICT', async () => {
    const { create, adapter } = createFixture();
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`tenantId`,`plate`)',
        { code: 'P2002', clientVersion: '7.10.0' },
      ),
    );

    await expect(adapter.createByTenant(TENANT_ID, data)).resolves.toEqual({
      ok: false,
      code: 'VEHICLE_PLATE_CONFLICT',
    });
  });

  it('propagates any other error unchanged', async () => {
    const { create, adapter } = createFixture();
    const failure = new Error('Database server connection lost');
    create.mockRejectedValue(failure);

    await expect(adapter.createByTenant(TENANT_ID, data)).rejects.toBe(failure);
  });

  it('rejects an invalid tenant id before touching the database', async () => {
    const { create, adapter } = createFixture();

    await expect(adapter.createByTenant('not-a-uuid', data)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
