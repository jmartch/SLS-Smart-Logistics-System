import type { Prisma } from '../../../../generated/prisma/client';
import { PrismaUserDirectoryAdapter } from './prisma-user-directory.adapter';

function fixture() {
  const tx = {
    $queryRaw: jest.fn(),
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return {
    tx,
    reader: new PrismaUserDirectoryAdapter().reader(
      tx as unknown as Prisma.TransactionClient,
      'tenant-a',
    ),
  };
}
describe('PrismaUserDirectoryAdapter', () => {
  it('selects only id, email and status with an explicit tenant filter', async () => {
    const { tx, reader } = fixture();
    await reader.findById('user');
    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: 'user' },
      select: { id: true, email: true, status: true },
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('locks the tenant user before reading when the workflow requires it', async () => {
    const { tx, reader } = fixture();
    await reader.findById('user', true);
    expect(tx.$queryRaw).toHaveBeenCalledWith(
      expect.any(Array),
      'tenant-a',
      'user',
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.findFirst.mock.invocationCallOrder[0],
    );
  });
  it('filters active unlinked candidates and paginates in stable email/id order', async () => {
    const { tx, reader } = fixture();
    await expect(
      reader.eligible({
        search: 'courier',
        excludedIds: ['linked'],
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual({ items: [], total: 0 });
    const where = {
      tenantId: 'tenant-a',
      status: 'ACTIVE',
      id: { notIn: ['linked'] },
      email: { contains: 'courier', mode: 'insensitive' },
    };
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where,
      select: { id: true, email: true, status: true },
      orderBy: [{ email: 'asc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(tx.user.count).toHaveBeenCalledWith({ where });
  });
  it('searches only the tenant email directory without loading credentials', async () => {
    const { tx, reader } = fixture();
    tx.user.findMany.mockResolvedValue([{ id: 'matched' }]);
    await expect(reader.searchIds('courier')).resolves.toEqual(['matched']);
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        email: { contains: 'courier', mode: 'insensitive' },
      },
      select: { id: true },
    });
  });
});
