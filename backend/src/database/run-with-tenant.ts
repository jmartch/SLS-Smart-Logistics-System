import { Prisma, PrismaClient } from '../../generated/prisma/client';

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTenantId(value: string): boolean {
	return UUID_PATTERN.test(value);
}

// Interactive-transaction bounds, in milliseconds: maxWait to obtain a
// connection, timeout for the whole transaction, plus optional isolationLevel.
// Omitted, Prisma's defaults apply (the behavior of every existing caller).
export interface RunWithTenantOptions {
	readonly isolationLevel?: Prisma.TransactionIsolationLevel;
	readonly maxWait?: number;
	readonly timeout?: number;
}

export type TenantTransactionOptions = RunWithTenantOptions;

export async function runWithTenant<T>(
	prisma: PrismaClient,
	tenantId: string,
	fn: (tx: Prisma.TransactionClient) => Promise<T>,
	options?: RunWithTenantOptions,
): Promise<T> {
	if (!isValidTenantId(tenantId)) {
		throw new Error(`runWithTenant: "${tenantId}" is not a valid tenant id`);
	}

	const txOptions = options
		? {
			...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
			...(options.maxWait !== undefined ? { maxWait: options.maxWait } : {}),
			...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
		}
		: undefined;

	const hasOptions = txOptions && Object.keys(txOptions).length > 0;

	const work = async (tx: Prisma.TransactionClient) => {
		if (typeof tx.$executeRaw === 'function') {
			await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
		} else if (typeof (tx as any).$executeRawUnsafe === 'function') {
			await (tx as any).$executeRawUnsafe(
				`SET LOCAL app.tenant_id = '${tenantId}'`,
			);
		}
		return fn(tx);
	};

	return hasOptions
		? prisma.$transaction(work, txOptions as any)
		: prisma.$transaction(work);
}