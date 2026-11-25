import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import { GeocodeAddressService } from '../../geocoding/application/geocode-address.service';
import { InvalidAddressError } from '../../geocoding/domain/invalid-address.error';
import type {
    PackageGeocodingCommand,
    PackageGeocodingPort,
} from '../application/ports/package-geocoding.port';

@Injectable()
export class PrismaPackageGeocodingAdapter implements PackageGeocodingPort {
    constructor(
        private readonly prisma: PrismaService,
        private readonly geocodeAddress: GeocodeAddressService,
    ) {}

    async geocodeAndAttach(command: PackageGeocodingCommand): Promise<void> {
        const dataset = await this.prisma.geoDataset.findFirst({
            where: { status: 'READY' },
            orderBy: [{ readyAt: 'desc' }, { createdAt: 'desc' }],
            select: { id: true },
        });

        if (!dataset) {
            return;
        }

        let result: Awaited<ReturnType<GeocodeAddressService['execute']>>;

        try {
            result = await this.geocodeAddress.execute({
                tenantId: command.tenantId,
                addressId: command.addressId,
                datasetId: dataset.id,
            });
        } catch (error) {
            if (error instanceof InvalidAddressError) {
                return;
            }
            throw error;
        }

        if (result.kind !== 'COMPLETED') {
            return;
        }

        await runWithTenant(this.prisma, command.tenantId, async (tx) => {
            await tx.package.updateMany({
                where: {
                    tenantId: command.tenantId,
                    id: command.packageId,
                },
                data: {
                    geocodingAttemptId: result.attemptId,
                },
            });

            if (result.decision.status !== 'MATCHED') {
                return;
            }

            const attempt = await tx.geocodingAttempt.findFirst({
                where: {
                    tenantId: command.tenantId,
                    id: result.attemptId,
                },
                select: {
                    selectedCandidateId: true,
                },
            });

            if (!attempt?.selectedCandidateId) {
                return;
            }

            await tx.$executeRaw`
                INSERT INTO "NetworkAttachment" (
                    "tenantId",
                    "datasetId",
                    "geocodingCandidateId",
                    profile,
                    "roadNodeId",
                    "snappedLocation",
                    "accessDistanceM",
                    status
                )
                SELECT
                    ${command.tenantId}::uuid,
                    ${dataset.id}::uuid,
                    gc.id,
                    'MOTOR_VEHICLE'::"RoadProfile",
                    nearest.id,
                    nearest.location,
                    ROUND(nearest."accessDistanceM"::numeric, 3),
                    'AUTO_ACCEPTED'::"NetworkAttachmentStatus"
                FROM "GeocodingCandidate" gc
                CROSS JOIN LATERAL (
                    SELECT
                        rn.id,
                        rn.location,
                        ST_Distance(rn.location::geography, gc.location::geography) AS "accessDistanceM"
                    FROM "RoadNode" rn
                    WHERE rn."datasetId" = ${dataset.id}::uuid
                      AND EXISTS (
                          SELECT 1
                          FROM "RoadEdge" re
                          WHERE re."datasetId" = rn."datasetId"
                            AND re.profile = 'MOTOR_VEHICLE'::"RoadProfile"
                            AND (re."fromNodeId" = rn.id OR re."toNodeId" = rn.id)
                      )
                    ORDER BY rn.location <-> gc.location ASC, rn.id ASC
                    LIMIT 1
                ) nearest
                WHERE gc."tenantId" = ${command.tenantId}::uuid
                  AND gc.id = ${attempt.selectedCandidateId}::uuid
                  AND gc."datasetId" = ${dataset.id}::uuid
                ON CONFLICT ("tenantId", "geocodingCandidateId", "datasetId", profile) DO NOTHING
            `;
        });
    }
}
