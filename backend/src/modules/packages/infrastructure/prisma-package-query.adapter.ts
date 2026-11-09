import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import {
    PackageQueryPort,
    type PackageDetailSnapshot,
    type PackageListFilter,
    type PackageListItem,
} from '../application/ports/package-query.port';

@Injectable()
export class PrismaPackageQueryAdapter extends PackageQueryPort {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async listByTenant(
        tenantId: string,
        filter?: PackageListFilter,
    ): Promise<PackageListItem[]> {
        const packages = await runWithTenant(this.prisma, tenantId, (tx) =>
            tx.package.findMany({
                where: {
                    tenantId,
                    ...(filter?.state ? { state: filter.state } : {}),
                },
                orderBy: { trackingCode: 'desc' },
                select: {
                    id: true,
                    trackingCode: true,
                    state: true,
                    priority: true,
                    weightKg: true,
                    volumeM3: true,
                    address: { select: { originalText: true } },
                    zone: { select: { name: true } },
                    sector: { select: { name: true } },
                    shipmentType: { select: { name: true } },
                    statusHistory: {
                        orderBy: { createdAt: 'asc' },
                        take: 1,
                        select: { createdAt: true },
                    },
                },
            }),
        );

        return packages.map((pkg) => ({
            id: pkg.id,
            trackingCode: pkg.trackingCode,
            state: pkg.state,
            priority: pkg.priority,
            weightKg: String(pkg.weightKg),
            volumeM3: String(pkg.volumeM3),
            address: pkg.address.originalText,
            zone: pkg.zone?.name ?? null,
            sector: pkg.sector?.name ?? null,
            shipmentType: pkg.shipmentType.name,
            registeredAt: pkg.statusHistory[0]?.createdAt ?? null,
        }));
    }

    async findByTenantAndId(
        tenantId: string,
        packageId: string,
    ): Promise<PackageDetailSnapshot | null> {
        const result = await runWithTenant(
            this.prisma,
            tenantId,
            async (tx) => {
                const pkg = await tx.package.findFirst({
                    where: { tenantId, id: packageId },
                    select: {
                        id: true,
                        trackingCode: true,
                        state: true,
                        priority: true,
                        weightKg: true,
                        volumeM3: true,
                        lengthCm: true,
                        widthCm: true,
                        heightCm: true,
                        deadline: true,
                        addressId: true,
                        geocodingAttemptId: true,
                        address: {
                            select: {
                                originalText: true,
                                municipalityCode: true,
                            },
                        },
                        zone: { select: { name: true } },
                        sector: { select: { name: true } },
                        shipmentType: { select: { name: true } },
                        geocodingAttempt: {
                            select: {
                                id: true,
                                datasetId: true,
                                selectedCandidateId: true,
                                status: true,
                                dataset: {
                                    select: {
                                        status: true,
                                    },
                                },
                                selectedCandidate: {
                                    select: {
                                        id: true,
                                        networkAttachments: {
                                            orderBy: { createdAt: 'desc' },
                                            select: {
                                                id: true,
                                                datasetId: true,
                                                status: true,
                                                profile: true,
                                                accessDistanceM: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        statusHistory: {
                            orderBy: { createdAt: 'asc' },
                            select: {
                                fromState: true,
                                toState: true,
                                reasonCode: true,
                                createdAt: true,
                                changedByUser: { select: { email: true } },
                            },
                        },
                    },
                });
                if (!pkg) return null;

                const auditPromise = tx.auditLog.findFirst({
                    where: {
                        tenantId,
                        entityType: 'Package',
                        entityId: packageId,
                        action: 'PACKAGE_GEOCODING_DIAGNOSTIC',
                    },
                    orderBy: { createdAt: 'desc' },
                    select: {
                        metadata: true,
                    },
                });

                const candidatePromise: Promise<
                    Array<{
                        id: string;
                        rank: number;
                        score: string;
                        latitude: number;
                        longitude: number;
                        precision: string;
                        source: string;
                    }>
                > = pkg.geocodingAttemptId
                    ? tx.$queryRaw<
                          Array<{
                              id: string;
                              rank: number;
                              score: string;
                              latitude: number;
                              longitude: number;
                              precision: string;
                              source: string;
                          }>
                      >`
                      SELECT
                          id,
                          rank,
                          score::text,
                          ST_Y(location)::float8 AS latitude,
                          ST_X(location)::float8 AS longitude,
                          precision::text,
                          source
                      FROM "GeocodingCandidate"
                      WHERE "tenantId" = ${tenantId}::uuid
                        AND "attemptId" = ${pkg.geocodingAttemptId}::uuid
                      ORDER BY rank ASC
                  `
                    : Promise.resolve([]);

                const [latestDiagnosticAudit, candidateRows] =
                    await Promise.all([auditPromise, candidatePromise]);

                return { pkg, latestDiagnosticAudit, candidateRows };
            },
        );

        if (!result) return null;

        const { pkg, latestDiagnosticAudit, candidateRows } = result;

        const auditMetadata =
            latestDiagnosticAudit?.metadata &&
            typeof latestDiagnosticAudit.metadata === 'object' &&
            !Array.isArray(latestDiagnosticAudit.metadata)
                ? (latestDiagnosticAudit.metadata as Record<string, unknown>)
                : null;

        const rawAttachments =
            pkg.geocodingAttempt?.selectedCandidate?.networkAttachments ?? [];
        const mappedAttachments = rawAttachments.map((a) => ({
            id: a.id,
            datasetId: a.datasetId,
            profile: a.profile,
            status: a.status,
            accessDistanceMeters: Number(a.accessDistanceM),
        }));

        const candidates = candidateRows.map((c) => ({
            id: c.id,
            rank: c.rank,
            score: Number(c.score),
            latitude: c.latitude,
            longitude: c.longitude,
            precision: c.precision,
            source: c.source,
        }));

        const geocodingAttempt = pkg.geocodingAttempt
            ? {
                  id: pkg.geocodingAttempt.id,
                  datasetId: pkg.geocodingAttempt.datasetId,
                  selectedCandidateId: pkg.geocodingAttempt.selectedCandidateId,
                  status: pkg.geocodingAttempt.status,
                  isDatasetReady:
                      pkg.geocodingAttempt.dataset?.status === 'READY',
                  selectedCandidate: pkg.geocodingAttempt.selectedCandidate
                      ? {
                            id: pkg.geocodingAttempt.selectedCandidate.id,
                            networkAttachments: mappedAttachments,
                        }
                      : null,
              }
            : null;

        return {
            id: pkg.id,
            trackingCode: pkg.trackingCode,
            state: pkg.state,
            priority: pkg.priority,
            weightKg: String(pkg.weightKg),
            volumeM3: String(pkg.volumeM3),
            lengthCm: String(pkg.lengthCm),
            widthCm: String(pkg.widthCm),
            heightCm: String(pkg.heightCm),
            deadline: pkg.deadline,
            address: pkg.address.originalText,
            zone: pkg.zone?.name ?? null,
            sector: pkg.sector?.name ?? null,
            shipmentType: pkg.shipmentType.name,
            registeredAt: pkg.statusHistory[0]?.createdAt ?? null,
            addressId: pkg.addressId,
            municipalityCode: pkg.address?.municipalityCode ?? null,
            geocodingAttemptId: pkg.geocodingAttemptId,
            geocodingAttempt,
            latestDiagnosticAuditMetadata: auditMetadata,
            candidates,
            history: pkg.statusHistory.map((item) => ({
                fromState: item.fromState,
                toState: item.toState,
                reasonCode: item.reasonCode,
                changedBy: item.changedByUser?.email ?? null,
                createdAt: item.createdAt,
            })),
        };
    }
}
