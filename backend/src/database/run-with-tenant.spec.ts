import type { PrismaClient } from '../../generated/prisma/client';
import { isValidTenantId, runWithTenant } from './run-with-tenant';

const TENANT_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('isValidTenantId', () => {
  it('accepts a well-formed UUID', () => {
    expect(isValidTenantId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  it('rejects a value that is not a UUID', () => {
    expect(isValidTenantId('\'; DROP TABLE "Package"; --')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidTenantId('')).toBe(false);
  });
});

describe('runWithTenant', () => {
  // A stand-in client: the callback runs with a fake transaction so the test
  // can see which arguments reach $transaction.
  function fakeClient() {
    const executeRawUnsafe = jest.fn().mockResolvedValue(0);
    const $transaction = jest.fn(
      (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ $executeRawUnsafe: executeRawUnsafe }),
    );

    return {
      client: { $transaction } as unknown as PrismaClient,
      $transaction,
      executeRawUnsafe,
    };
  }

  it('keeps the default transaction options when none are given', async () => {
    const { client, $transaction, executeRawUnsafe } = fakeClient();

    await expect(
      runWithTenant(client, TENANT_ID, () => Promise.resolve('done')),
    ).resolves.toBe('done');

    // Exactly one argument: Prisma's own defaults apply, as before.
    expect($transaction.mock.calls[0]).toHaveLength(1);
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
    );
  });

  it('passes explicit maxWait and timeout through to the transaction', async () => {
    const { client, $transaction } = fakeClient();

    await runWithTenant(client, TENANT_ID, () => Promise.resolve(null), {
      maxWait: 5_000,
      timeout: 15_000,
    });

    expect($transaction.mock.calls[0][1]).toEqual({
      maxWait: 5_000,
      timeout: 15_000,
    });
  });

  it('rejects an invalid tenant id before opening a transaction', async () => {
    const { client, $transaction } = fakeClient();

    await expect(
      runWithTenant(client, 'not-a-uuid', () => Promise.resolve(null)),
    ).rejects.toThrow('not a valid tenant id');
    expect($transaction).not.toHaveBeenCalled();
  });
});
