import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import { RouteSummaryReaderPort } from '../../application/ports/route-summary-reader.port';

@Injectable()
export class PrismaRouteSummaryReader implements RouteSummaryReaderPort {
    constructor(private readonly prisma: PrismaService) { }

    async findSummaryByRouteId(
        tenantId: string,
        routeId: string,
    ): Promise<Record<string, unknown> | null> {
        return runWithTenant(this.prisma, tenantId, async (client) => {
            const closure = await client.routeClosure.findUnique({
                where: {
                    tenantId_routeId: {
                        tenantId,
                        routeId,
                    },
                },
                select: {
                    resultSnapshot: true,
                },
            });

            if (!closure) {
                return null;
            }

            return closure.resultSnapshot as Record<string, unknown>;
        });
    }
}