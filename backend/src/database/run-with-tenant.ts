import { Prisma, PrismaClient } from '../../generated/prisma/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTenantId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// Interactive-transaction bounds, in milliseconds: maxWait to obtain a
// connection, timeout for the whole transaction. Omitted, Prisma's defaults
// apply (the behavior of every existing caller).
export interface TenantTransactionOptions {
  readonly maxWait?: number;
  readonly timeout?: number;
}

export async function runWithTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`runWithTenant: "${tenantId}" is not a valid tenant id`);
  }

  const work = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx);
  };

  return options === undefined
    ? prisma.$transaction(work)
    : prisma.$transaction(work, { ...options });
}
