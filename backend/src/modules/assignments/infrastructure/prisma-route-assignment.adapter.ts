import { Injectable } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '../../../../generated/prisma/client';
import {
	RouteAssignmentPort,
} from '../application/ports/route-assignment.port';
import {
	RouteAssignmentWriterPort,
	RouteAssignmentSnapshot,
} from '../../routes/application/ports/route-lifecycle-unit-of-work';

@Injectable()
export class PrismaRouteAssignmentAdapter
	implements RouteAssignmentPort, RouteAssignmentWriterPort {
	constructor(private readonly client: Prisma.TransactionClient) { }

	async findActiveAssignmentsByRouteId(
		tenantId: string,
		routeId: string,
	): Promise<readonly RouteAssignmentSnapshot[]> {
		const rows = await this.client.assignment.findMany({
			where: {
				tenantId,
				routeId,
				status: AssignmentStatus.ACTIVE,
			},
			select: {
				id: true,
				packageId: true,
				routeId: true,
				routeStopId: true,
				status: true,
			},
			orderBy: { id: 'asc' },
		});

		return rows.map((r) => ({
			id: r.id,
			packageId: r.packageId,
			routeId: r.routeId!,
			routeStopId: r.routeStopId,
			status: r.status as 'ACTIVE' | 'ENDED' | 'CANCELLED',
		}));
	}

	async cancelAssignmentsByRouteId(
		tenantId: string,
		routeId: string,
		reasonCode: string,
		endedAt: Date,
	): Promise<number> {
		const result = await this.client.assignment.updateMany({
			where: {
				tenantId,
				routeId,
				status: AssignmentStatus.ACTIVE,
			},
			data: {
				status: AssignmentStatus.CANCELLED,
				reasonCode,
				endedAt,
			},
		});

		return result.count;
	}
}
