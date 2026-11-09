import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
    AddressCorrectionAuditEntry,
    GeocodingDiagnosticAuditEntry,
    GeocodingReviewAuditEntry,
    PackageGeocodingAuditPort,
} from '../application/ports/package-geocoding-audit.port';
import type {
    CreateAddressVersionCommand,
    ExistingReviewRecord,
    GeocodingAttemptRecord,
    GeocodingCandidateRecord,
    GeocodingResolutionSnapshot,
    OperationRecord,
    PackageGeocodingRepositoryPort,
    PackageRecordForGeocoding,
    SaveGeocodingReviewCommand,
    SaveOperationCommand,
    UpdateAttemptDecisionCommand,
    UpdatePackageAddressCommand,
} from '../application/ports/package-geocoding-repository.port';
import type {
    PackageGeocodingSession,
    PackageGeocodingUnitOfWorkPort,
} from '../application/ports/package-geocoding.uow.port';
import type { NetworkAttachmentPort } from '../../geocoding/application/ports/network-attachment.port';
import type { GeocodingAddressPort } from '../../geocoding/application/ports/geocoding-address.port';
import type { GeocodingCatalogPort } from '../../geocoding/application/ports/geocoding-catalog.port';
import type { GeocodingAttemptPort } from '../../geocoding/application/ports/geocoding-attempt.port';
import type { PackageRegistrationPort } from '../application/ports/package-registration.port';
import { PrismaPackageRegistrationAdapter } from './prisma-package-registration.adapter';
import { PrismaGeocodingAddress } from '../../geocoding/infrastructure/prisma-geocoding-address';
import { PrismaGeocodingCatalog } from '../../geocoding/infrastructure/prisma-geocoding-catalog';
import { PrismaGeocodingAttempt } from '../../geocoding/infrastructure/prisma-geocoding-attempt';
import { PrismaNetworkAttachmentAdapter } from '../../geocoding/infrastructure/prisma-network-attachment.adapter';
import type { PackageGeocodingDiagnostic } from '../domain/package-geocoding.types';
import {
    PackageOperationCorruptedError,
    PackageOperationIdConflictError,
} from '../domain/package-errors';
import type { RoadProfile } from '../../geocoding/domain/network-attachment.types';

class PrismaSessionRepository implements PackageGeocodingRepositoryPort {
    constructor(
        private readonly tx: Prisma.TransactionClient,
        private readonly tenantId: string,
    ) {}

    async findPackageForUpdate(
        tenantId: string,
        packageId: string,
    ): Promise<PackageRecordForGeocoding | null> {
        const rows = await this.tx.$queryRaw<
            Array<{
                id: string;
                tenantId: string;
                state: string;
                addressId: string;
                geocodingAttemptId: string | null;
                originalText: string;
                municipalityCode: string;
            }>
        >`
            SELECT
                p.id,
                p."tenantId",
                p.state::text,
                p."addressId",
                p."geocodingAttemptId",
                a."originalText",
                a."municipalityCode"
            FROM "Package" p
            JOIN "Address" a ON a.id = p."addressId" AND a."tenantId" = p."tenantId"
            WHERE p."tenantId" = ${tenantId}::uuid
              AND p.id = ${packageId}::uuid
            FOR UPDATE OF p
        `;

        if (rows.length === 0) {
            return null;
        }

        return rows[0];
    }

    async findOperation(
        tenantId: string,
        operationId: string,
    ): Promise<OperationRecord | null> {
        const lockKey = `pkg_geo_op:${tenantId}:${operationId}`;
        await this.tx
            .$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`;

        const rows = await this.tx.$queryRaw<
            Array<{
                entityId: string;
                metadata: Prisma.JsonValue;
            }>
        >`
            SELECT
                "entityId",
                metadata
            FROM "AuditLog"
            WHERE "tenantId" = ${tenantId}::uuid
              AND action = 'PACKAGE_GEOCODING_OPERATION'
              AND metadata->>'operationId' = ${operationId}
            ORDER BY "createdAt" DESC
            LIMIT 1
        `;

        if (rows.length === 0) {
            return null;
        }

        const row = rows[0];
        if (
            typeof row.entityId !== 'string' ||
            row.entityId.trim().length === 0
        ) {
            throw new PackageOperationCorruptedError(operationId);
        }

        const meta =
            row.metadata &&
            typeof row.metadata === 'object' &&
            !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : null;

        if (
            !meta ||
            typeof meta.payloadHash !== 'string' ||
            !meta.result ||
            typeof meta.result !== 'object' ||
            Array.isArray(meta.result)
        ) {
            throw new PackageOperationCorruptedError(operationId);
        }

        const resObj = meta.result as Record<string, unknown>;

        if (resObj.attemptId !== null && typeof resObj.attemptId !== 'string') {
            throw new PackageOperationCorruptedError(operationId);
        }
        if (
            resObj.selectedCandidateId !== null &&
            typeof resObj.selectedCandidateId !== 'string'
        ) {
            throw new PackageOperationCorruptedError(operationId);
        }
        if (
            resObj.attachmentId !== null &&
            typeof resObj.attachmentId !== 'string'
        ) {
            throw new PackageOperationCorruptedError(operationId);
        }
        if (resObj.datasetId !== null && typeof resObj.datasetId !== 'string') {
            throw new PackageOperationCorruptedError(operationId);
        }
        if (
            resObj.unsuitabilityReason !== null &&
            typeof resObj.unsuitabilityReason !== 'string'
        ) {
            throw new PackageOperationCorruptedError(operationId);
        }
        if (typeof resObj.directedReachabilityVerified !== 'boolean') {
            throw new PackageOperationCorruptedError(operationId);
        }

        const validStatus = (
            [
                'MATCHED',
                'REVIEW_REQUIRED',
                'NOT_FOUND',
                'UNSUPPORTED_ADDRESS_FORMAT',
                'DATASET_NOT_READY',
                'NETWORK_ATTACHMENT_NOT_READY',
            ] as const
        ).find((s) => s === resObj.status);

        const validEligibility = (['ELIGIBLE', 'INELIGIBLE'] as const).find(
            (e) => e === resObj.eligibility,
        );

        if (!validStatus || !validEligibility) {
            throw new PackageOperationCorruptedError(operationId);
        }

        if (
            resObj.profile !== null &&
            !['MOTOR_VEHICLE', 'MOTORCYCLE', 'BICYCLE', 'FOOT'].includes(
                resObj.profile as string,
            )
        ) {
            throw new PackageOperationCorruptedError(operationId);
        }
        const validProfile = (resObj.profile as RoadProfile) ?? null;

        if (
            resObj.attachmentStatus !== null &&
            ![
                'AUTO_ACCEPTED',
                'REVIEW_REQUIRED',
                'APPROVED',
                'REJECTED',
            ].includes(resObj.attachmentStatus as string)
        ) {
            throw new PackageOperationCorruptedError(operationId);
        }
        const validAttachmentStatus = resObj.attachmentStatus as
            | 'AUTO_ACCEPTED'
            | 'REVIEW_REQUIRED'
            | 'APPROVED'
            | 'REJECTED'
            | null;

        if (validEligibility === 'ELIGIBLE') {
            const hasValidCandidate =
                typeof resObj.selectedCandidateId === 'string' &&
                resObj.selectedCandidateId.length > 0;
            const hasValidAttachment =
                typeof resObj.attachmentId === 'string' &&
                resObj.attachmentId.length > 0;
            const isAttachmentApproved =
                validAttachmentStatus === 'AUTO_ACCEPTED' ||
                validAttachmentStatus === 'APPROVED';

            if (
                validStatus !== 'MATCHED' ||
                !hasValidCandidate ||
                !hasValidAttachment ||
                !isAttachmentApproved
            ) {
                throw new PackageOperationCorruptedError(operationId);
            }
        }

        const decodedResult: PackageGeocodingDiagnostic = {
            status: validStatus,
            eligibility: validEligibility,
            attemptId: resObj.attemptId,
            selectedCandidateId: resObj.selectedCandidateId,
            attachmentId: resObj.attachmentId,
            attachmentStatus: validAttachmentStatus,
            unsuitabilityReason: resObj.unsuitabilityReason,
            datasetId: resObj.datasetId,
            profile: validProfile,
            directedReachabilityVerified: resObj.directedReachabilityVerified,
        };

        return {
            operationId,
            tenantId,
            packageId: row.entityId,
            payloadHash: meta.payloadHash,
            result: decodedResult,
        };
    }

    async saveOperation(command: SaveOperationCommand): Promise<void> {
        const lockKey = `pkg_geo_op:${command.tenantId}:${command.operationId}`;
        await this.tx
            .$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`;

        const existing = await this.tx.$queryRaw<
            Array<{ id: string; metadata: Prisma.JsonValue }>
        >`
            SELECT id, metadata
            FROM "AuditLog"
            WHERE "tenantId" = ${command.tenantId}::uuid
              AND action = 'PACKAGE_GEOCODING_OPERATION'
              AND metadata->>'operationId' = ${command.operationId}
            LIMIT 1
        `;

        if (existing.length > 0) {
            const existingMeta =
                existing[0].metadata &&
                typeof existing[0].metadata === 'object' &&
                !Array.isArray(existing[0].metadata)
                    ? (existing[0].metadata as Record<string, unknown>)
                    : null;
            if (
                !existingMeta ||
                existingMeta.payloadHash !== command.payloadHash
            ) {
                throw new PackageOperationIdConflictError(command.operationId);
            }
            return;
        }

        const serializedResult: Prisma.InputJsonObject = {
            status: command.result.status,
            eligibility: command.result.eligibility,
            attemptId: command.result.attemptId,
            selectedCandidateId: command.result.selectedCandidateId,
            attachmentId: command.result.attachmentId,
            attachmentStatus: command.result.attachmentStatus,
            unsuitabilityReason: command.result.unsuitabilityReason,
            datasetId: command.result.datasetId,
            profile: command.result.profile,
            directedReachabilityVerified:
                command.result.directedReachabilityVerified,
        };

        const serializedMetadata: Prisma.InputJsonObject = {
            operationId: command.operationId,
            payloadHash: command.payloadHash,
            result: serializedResult,
        };

        await this.tx.auditLog.create({
            data: {
                tenantId: command.tenantId,
                action: 'PACKAGE_GEOCODING_OPERATION',
                entityType: 'Package',
                entityId: command.packageId,
                metadata: serializedMetadata,
            },
        });
    }

    async linkGeocodingAttempt(
        tenantId: string,
        packageId: string,
        attemptId: string,
    ): Promise<void> {
        await this.tx.package.update({
            where: {
                tenantId_id: {
                    tenantId,
                    id: packageId,
                },
            },
            data: {
                geocodingAttemptId: attemptId,
            },
        });
    }

    async hasActiveAssignment(
        tenantId: string,
        packageId: string,
    ): Promise<boolean> {
        const count = await this.tx.assignment.count({
            where: {
                tenantId,
                packageId,
                status: 'ACTIVE',
            },
        });
        return count > 0;
    }

    async isAttemptConsumedByRouteStop(
        tenantId: string,
        attemptId: string,
    ): Promise<boolean> {
        const count = await this.tx.routeStop.count({
            where: {
                geocodingAttemptId: attemptId,
                route: {
                    tenantId,
                },
            },
        });
        return count > 0;
    }

    async findAttemptById(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingAttemptRecord | null> {
        const attempt = await this.tx.geocodingAttempt.findFirst({
            where: {
                tenantId,
                id: attemptId,
            },
            select: {
                id: true,
                tenantId: true,
                addressId: true,
                datasetId: true,
                status: true,
                selectedCandidateId: true,
            },
        });

        if (!attempt) return null;

        return {
            id: attempt.id,
            tenantId: attempt.tenantId,
            addressId: attempt.addressId,
            datasetId: attempt.datasetId,
            status: attempt.status,
            selectedCandidateId: attempt.selectedCandidateId,
        };
    }

    async updateAttemptDecision(
        tenantId: string,
        attemptId: string,
        update: UpdateAttemptDecisionCommand,
    ): Promise<void> {
        await this.tx.geocodingAttempt.updateMany({
            where: {
                tenantId,
                id: attemptId,
            },
            data: {
                selectedCandidateId: update.selectedCandidateId,
                status: update.status,
            },
        });
    }

    async findCandidateById(
        tenantId: string,
        candidateId: string,
    ): Promise<GeocodingCandidateRecord | null> {
        const rows = await this.tx.$queryRaw<
            Array<{
                id: string;
                tenantId: string;
                attemptId: string;
                datasetId: string;
                latitude: number;
                longitude: number;
                rank: number;
                score: string;
            }>
        >`
            SELECT
                id,
                "tenantId",
                "attemptId",
                "datasetId",
                ST_Y(location)::float8 AS latitude,
                ST_X(location)::float8 AS longitude,
                rank,
                score::text
            FROM "GeocodingCandidate"
            WHERE "tenantId" = ${tenantId}::uuid
              AND id = ${candidateId}::uuid
            LIMIT 1
        `;

        if (rows.length === 0) return null;

        const row = rows[0];
        return {
            id: row.id,
            tenantId: row.tenantId,
            attemptId: row.attemptId,
            datasetId: row.datasetId,
            latitude: row.latitude,
            longitude: row.longitude,
            rank: row.rank,
            score: Number(row.score),
        };
    }

    async findSelectedCandidateForAttempt(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingCandidateRecord | null> {
        const attempt = await this.findAttemptById(tenantId, attemptId);
        if (!attempt || !attempt.selectedCandidateId) {
            return null;
        }
        return this.findCandidateById(tenantId, attempt.selectedCandidateId);
    }

    async findResolutionSnapshot(
        tenantId: string,
        packageId: string,
    ): Promise<GeocodingResolutionSnapshot | null> {
        const pkg = await this.findPackageForUpdate(tenantId, packageId);
        if (!pkg || !pkg.geocodingAttemptId) {
            return null;
        }

        const attempt = await this.findAttemptById(
            tenantId,
            pkg.geocodingAttemptId,
        );
        if (!attempt) return null;

        const candidate = attempt.selectedCandidateId
            ? await this.findCandidateById(
                  tenantId,
                  attempt.selectedCandidateId,
              )
            : null;

        const attachments: Array<{
            id: string;
            datasetId: string;
            profile: string;
            status: string;
            accessDistanceMeters: number;
        }> = [];

        let isDatasetReady = true;

        if (candidate) {
            const attRows = await this.tx.$queryRaw<
                Array<{
                    id: string;
                    tenantId: string;
                    datasetId: string;
                    geocodingCandidateId: string;
                    profile: string;
                    roadNodeId: string | null;
                    roadEdgeId: string | null;
                    status: string;
                    accessDistanceM: string;
                    datasetStatus: string;
                }>
            >`
                SELECT
                    a.id,
                    a."tenantId",
                    a."datasetId",
                    a."geocodingCandidateId",
                    a.profile::text,
                    a."roadNodeId",
                    a."roadEdgeId",
                    a.status::text,
                    a."accessDistanceM"::text,
                    d.status::text AS "datasetStatus"
                FROM "NetworkAttachment" a
                JOIN "GeoDataset" d ON d.id = a."datasetId"
                WHERE a."tenantId" = ${tenantId}::uuid
                  AND a."geocodingCandidateId" = ${candidate.id}::uuid
            `;
            for (const a of attRows) {
                if (a.datasetStatus !== 'READY') {
                    isDatasetReady = false;
                }
                attachments.push({
                    id: a.id,
                    datasetId: a.datasetId,
                    profile: a.profile,
                    status: a.status,
                    accessDistanceMeters: Number(a.accessDistanceM),
                });
            }
        } else {
            const ds = await this.tx.geoDataset.findUnique({
                where: { id: attempt.datasetId },
                select: { status: true },
            });
            isDatasetReady = ds?.status === 'READY';
        }

        return {
            attemptId: attempt.id,
            attemptStatus: attempt.status,
            attemptDatasetId: attempt.datasetId,
            isDatasetReady,
            selectedCandidateId: candidate?.id ?? null,
            networkAttachments: attachments,
        };
    }

    async findLatestReview(
        tenantId: string,
        attemptId: string,
        candidateId: string,
    ): Promise<ExistingReviewRecord | null> {
        const review = await this.tx.geocodingReview.findFirst({
            where: {
                tenantId,
                attemptId,
                candidateId,
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                decision: true,
                candidateId: true,
            },
        });

        if (!review) return null;

        return {
            id: review.id,
            decision: review.decision,
            candidateId: review.candidateId,
        };
    }

    async saveGeocodingReview(
        command: SaveGeocodingReviewCommand,
    ): Promise<void> {
        await this.tx.geocodingReview.create({
            data: {
                tenantId: command.tenantId,
                attemptId: command.attemptId,
                candidateId: command.candidateId,
                reviewerId: command.reviewerId,
                decision: command.decision,
                reason: command.reason,
            },
        });
    }

    async createAddressVersion(
        command: CreateAddressVersionCommand,
    ): Promise<{ readonly id: string }> {
        const addr = await this.tx.address.create({
            data: {
                tenantId: command.tenantId,
                originalText: command.originalText,
                municipalityCode: command.municipalityCode,
            },
            select: {
                id: true,
            },
        });
        return { id: addr.id };
    }

    async updatePackageAddress(
        command: UpdatePackageAddressCommand,
    ): Promise<void> {
        await this.tx.package.update({
            where: {
                tenantId_id: {
                    tenantId: command.tenantId,
                    id: command.packageId,
                },
            },
            data: {
                addressId: command.addressId,
                geocodingAttemptId: null,
            },
        });
    }
}

class PrismaSessionAuditPort implements PackageGeocodingAuditPort {
    constructor(
        private readonly tx: Prisma.TransactionClient,
        private readonly tenantId: string,
    ) {}

    async recordDiagnostic(
        entry: GeocodingDiagnosticAuditEntry,
    ): Promise<void> {
        await this.tx.auditLog.create({
            data: {
                tenantId: this.tenantId,
                action: 'PACKAGE_GEOCODING_DIAGNOSTIC',
                entityType: 'Package',
                entityId: entry.packageId,
                correlationId: entry.correlationId,
                actorUserId: entry.actorUserId,
                metadata: {
                    addressId: entry.addressId,
                    attemptId: entry.attemptId,
                    selectedCandidateId: entry.selectedCandidateId,
                    attachmentId: entry.attachmentId,
                    attachmentStatus: entry.attachmentStatus,
                    datasetId: entry.datasetId,
                    profile: entry.profile,
                    status: entry.status,
                    eligibility: entry.eligibility,
                    reason: entry.reason,
                },
            },
        });
    }

    async recordAddressCorrection(
        entry: AddressCorrectionAuditEntry,
    ): Promise<void> {
        await this.tx.auditLog.create({
            data: {
                tenantId: this.tenantId,
                action: 'PACKAGE_ADDRESS_CORRECTED',
                entityType: 'Package',
                entityId: entry.packageId,
                correlationId: entry.correlationId,
                actorUserId: entry.actorUserId,
                metadata: {
                    previousAddressId: entry.previousAddressId,
                    newAddressId: entry.newAddressId,
                    reason: entry.reason,
                },
            },
        });
    }

    async recordReview(entry: GeocodingReviewAuditEntry): Promise<void> {
        await this.tx.auditLog.create({
            data: {
                tenantId: this.tenantId,
                action: 'PACKAGE_GEOCODING_REVIEWED',
                entityType: 'Package',
                entityId: entry.packageId,
                correlationId: entry.correlationId,
                actorUserId: entry.reviewerUserId,
                metadata: {
                    attemptId: entry.attemptId,
                    candidateId: entry.candidateId,
                    decision: entry.decision,
                    reason: entry.reason,
                },
            },
        });
    }
}

@Injectable()
export class PrismaPackageGeocodingUnitOfWork implements PackageGeocodingUnitOfWorkPort {
    constructor(
        private readonly prisma: PrismaService,
        private readonly registrationAdapter: PrismaPackageRegistrationAdapter,
        private readonly geocodingAddressAdapter: PrismaGeocodingAddress,
        private readonly geocodingCatalogAdapter: PrismaGeocodingCatalog,
        private readonly geocodingAttemptAdapter: PrismaGeocodingAttempt,
        private readonly networkAttachmentAdapter: PrismaNetworkAttachmentAdapter,
    ) {}

    async runInTransaction<T>(
        tenantId: string,
        operation: (session: PackageGeocodingSession) => Promise<T>,
    ): Promise<T> {
        return runWithTenant(this.prisma, tenantId, async (tx) => {
            const sessionRegistrationPort: PackageRegistrationPort = {
                loadReferences: (_t, q) =>
                    this.registrationAdapter.loadReferencesInTx(
                        tx,
                        tenantId,
                        q,
                    ),
                registerByTenant: (_ctx, data, token) =>
                    this.registrationAdapter.registerInTx(
                        tx,
                        _ctx,
                        data,
                        token,
                    ),
            };

            const sessionAddressPort: GeocodingAddressPort = {
                findByTenant: (q) =>
                    this.geocodingAddressAdapter.findByTenantInTx(tx, q),
            };

            const sessionCatalogPort: GeocodingCatalogPort = {
                findCandidates: (q) =>
                    this.geocodingCatalogAdapter.findCandidatesInTx(tx, q),
            };

            const sessionAttemptPort: GeocodingAttemptPort = {
                saveAtomically: (cmd) =>
                    this.geocodingAttemptAdapter.saveInTx(tx, cmd),
            };

            const sessionAttachmentPort: NetworkAttachmentPort = {
                findCandidateNodes: (q) =>
                    this.networkAttachmentAdapter.findCandidateNodesInTx(tx, q),
                saveAttachment: (cmd) =>
                    this.networkAttachmentAdapter.saveAttachmentInTx(tx, cmd),
                findByCandidateAndProfile: (q) =>
                    this.networkAttachmentAdapter.findByCandidateAndProfileInTx(
                        tx,
                        q,
                    ),
            };

            const sessionRepo = new PrismaSessionRepository(tx, tenantId);
            const sessionAudit = new PrismaSessionAuditPort(tx, tenantId);

            const session: PackageGeocodingSession = {
                registrationPort: sessionRegistrationPort,
                geocodingAddressPort: sessionAddressPort,
                geocodingCatalogPort: sessionCatalogPort,
                geocodingAttemptPort: sessionAttemptPort,
                networkAttachmentPort: sessionAttachmentPort,
                packageRepository: sessionRepo,
                auditPort: sessionAudit,
            };

            return operation(session);
        });
    }
}
