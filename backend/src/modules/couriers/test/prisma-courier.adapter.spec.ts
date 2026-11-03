import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaCourierAdapter } from '../infrastructure/prisma-courier.adapter';
import {
  CourierAlreadyLinkedError,
  CourierConcurrencyError,
} from '../domain/courier-errors';

const context = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  actorUserId: '20000000-0000-4000-8000-000000000001',
  correlationId: '30000000-0000-4000-8000-000000000001',
};
function fixture() {
  const tx = {
    $executeRawUnsafe: jest.fn(),
    courier: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const transaction = jest.fn(
    async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const reader = { findById: jest.fn() };
  const users = { reader: jest.fn().mockReturnValue(reader) };
  const adapter = new PrismaCourierAdapter(
    { $transaction: transaction } as unknown as PrismaService,
    users,
  );
  return { tx, transaction, reader, users, adapter };
}
describe('PrismaCourierAdapter', () => {
  it('uses the users-owned reader in the same serializable tenant transaction', async () => {
    const { adapter, tx, transaction, reader, users } = fixture();
    await adapter.run(context, (session) => session.findUserForUpdate('user'));
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.tenant_id = '${context.tenantId}'`,
    );
    expect(users.reader).toHaveBeenCalledWith(tx, context.tenantId);
    expect(reader.findById).toHaveBeenCalledWith('user', true);
  });
  it('persists only minimal status audit data with trusted actor and tenant', async () => {
    const { adapter, tx } = fixture();
    await adapter.run(context, (session) =>
      session.audit('courier', 'COURIER_REGISTERED', null, {
        userId: 'user',
        status: 'ACTIVE',
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        ...context,
        entityType: 'Courier',
        entityId: 'courier',
        action: 'COURIER_REGISTERED',
        metadata: { before: null, after: { userId: 'user', status: 'ACTIVE' } },
      },
    });
  });
  it('maps a unique conflict without swallowing unrelated errors', async () => {
    const { adapter, tx } = fixture();
    tx.courier.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Duplicate user', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    await expect(
      adapter.run(context, (session) => session.create('user')),
    ).rejects.toBeInstanceOf(CourierAlreadyLinkedError);
    tx.courier.create.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(
      adapter.run(context, (session) => session.create('user')),
    ).rejects.toThrow('Database unavailable');
  });
  it('bounds serialization retries to three attempts', async () => {
    const { adapter, transaction } = fixture();
    transaction.mockRejectedValue(
      Object.assign(new Error('Serialization failure'), { code: 'P2034' }),
    );
    await expect(
      adapter.run(context, () => Promise.resolve(undefined)),
    ).rejects.toBeInstanceOf(CourierConcurrencyError);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
