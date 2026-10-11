import { Injectable } from '@nestjs/common';
import {
	PackageState,
	Prisma,
} from '../../../../generated/prisma/client';
import {
	PackageStateUpdate,
	PackageStatusHistoryRecord,
	PackageStateWriterPort,
} from '../application/ports/package-state-writer.port';
import {
	RoutePackageWriterPort,
	RoutePackageSnapshot,
	PackageStateUpdateItem,
	PackageStatusHistoryItem,
} from '../../routes/application/ports/route-lifecycle-unit-of-work.port';

interface RawLockedPackageRow {
	readonly id: string;
	readonly tenantId: string;
	readonly trackingCode: string;
	readonly state: PackageState;
	readonly weightKg: Prisma.Decimal | number | string;
	readonly volumeM3: Prisma.Decimal | number | string;
}

@Injectable()
export class PrismaPackageStateWriter
	implements PackageStateWriterPort, RoutePackageWriterPort {
	constructor(private readonly client: Prisma.TransactionClient) { }

	async findPackagesByRouteId(
		tenantId: string,
		routeId: string,
	): Promise<readonly RoutePackageSnapshot[]> {
		// Deterministic lock on route packages in ID order to avoid deadlocks
		const rows = await this.client.$queryRaw<RawLockedPackageRow[]>`
			SELECT p.id, p."tenantId", p."trackingCode", p.state, p."weightKg", p."volumeM3"
			FROM "Package" p
			INNER JOIN "Assignment" a ON a."packageId" = p.id AND a."tenantId" = p."tenantId"
			WHERE p."tenantId" = ${tenantId}::uuid
				AND a."routeId" = ${routeId}::uuid
				AND a.status = 'ACTIVE'
			ORDER BY p.id ASC
			FOR UPDATE OF p
		`;

		return rows.map((r) => ({
			id: r.id,
			tenantId: r.tenantId,
			trackingCode: r.trackingCode,
			currentState: r.state,
			weightKg: Number(r.weightKg),
			volumeM3: Number(r.volumeM3),
		}));
	}

	async updatePackageStates(
		tenantId: string,
		updates: readonly PackageStateUpdate[] | readonly PackageStateUpdateItem[],
	): Promise<void> {
		for (const update of updates) {
			await this.client.package.updateMany({
				where: {
					id: update.packageId,
					tenantId,
					state: update.previousState as PackageState,
				},
				data: {
					state: update.nextState as PackageState,
				},
			});
		}
	}

	async recordStatusHistories(
		tenantId: string,
		histories:
			| readonly PackageStatusHistoryRecord[]
			| readonly PackageStatusHistoryItem[],
	): Promise<void> {
		if (histories.length === 0) {
			return;
		}

		await this.client.packageStatusHistory.createMany({
			data: histories.map((h) => ({
				tenantId,
				packageId: h.packageId,
				fromState: h.previousState as PackageState,
				toState: h.nextState as PackageState,
				reasonCode: h.reasonCode ?? null,
				changedByUserId: h.changedByUserId,
				createdAt: h.changedAt,
			})),
		});
	}
}
