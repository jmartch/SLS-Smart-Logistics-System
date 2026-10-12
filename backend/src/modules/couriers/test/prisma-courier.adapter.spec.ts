import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PrismaCourierAdapter } from '../infrastructure/prisma-courier.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '30000000-0000-4000-8000-000000000001';
const COURIER_ID = '40000000-0000-4000-8000-000000000001';

function createFixture() {
  const executeRawUnsafe = jest.fn().mockResolvedValue(1);
  const findFirst = jest.fn();
  const create = jest.fn();
  const transaction = {
    $executeRawUnsafe: executeRawUnsafe,
    user: { findFirst },
    courier: { create },
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  return {
    findFirst,
    create,
    executeRawUnsafe,
    adapter: new PrismaCourierAdapter(prisma),
  };
}

describe('PrismaCourierAdapter', () => {
  describe('findUserByTenant', () => {
    it('looks the user up inside the tenant session and selects only id and status', async () => {
      const { findFirst, executeRawUnsafe, adapter } = createFixture();
      findFirst.mockResolvedValue({ id: USER_ID, status: 'ACTIVE' });

      const result = await adapter.findUserByTenant(TENANT_ID, USER_ID);

      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, id: USER_ID },
        select: { id: true, status: true },
      });
      expect(result).toEqual({ id: USER_ID, status: 'ACTIVE' });
    });

    it('returns null when the user is not visible in the tenant', async () => {
      const { findFirst, adapter } = createFixture();
      findFirst.mockResolvedValue(null);

      await expect(
        adapter.findUserByTenant(TENANT_ID, USER_ID),
      ).resolves.toBeNull();
    });
  });

  describe('createByTenant', () => {
    it('creates the courier scoped to the tenant', async () => {
      const { create, executeRawUnsafe, adapter } = createFixture();
      const row = {
        id: COURIER_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        status: 'ACTIVE',
      };
      create.mockResolvedValue(row);

      const result = await adapter.createByTenant(TENANT_ID, {
        userId: USER_ID,
      });

      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tenantId: TENANT_ID, userId: USER_ID },
        }),
      );
      expect(result).toEqual({ ok: true, courier: row });
    });

    it('translates P2002 into COURIER_USER_ALREADY_LINKED', async () => {
      const { create, adapter } = createFixture();
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`userId`)',
          { code: 'P2002', clientVersion: '7.10.0' },
        ),
      );

      await expect(
        adapter.createByTenant(TENANT_ID, { userId: USER_ID }),
      ).resolves.toEqual({ ok: false, code: 'COURIER_USER_ALREADY_LINKED' });
    });

    it('propagates any other error unchanged', async () => {
      const { create, adapter } = createFixture();
      const failure = new Error('Database server connection lost');
      create.mockRejectedValue(failure);

      await expect(
        adapter.createByTenant(TENANT_ID, { userId: USER_ID }),
      ).rejects.toBe(failure);
    });

    it('rejects an invalid tenant id before touching the database', async () => {
      const { create, adapter } = createFixture();

      await expect(
        adapter.createByTenant('not-a-uuid', { userId: USER_ID }),
      ).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
    });
  });
});
