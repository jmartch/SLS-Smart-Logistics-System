import { Prisma, PrismaClient } from '../../generated/prisma/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTenantId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function runWithTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`runWithTenant: "${tenantId}" is not a valid tenant id`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx);
  });
}
