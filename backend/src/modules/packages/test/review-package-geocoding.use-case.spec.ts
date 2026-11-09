import {
    PackageActiveAssignmentConflictError,
    PackageGeocodingCandidateNotFoundError,
    PackageGeocodingReferenceMismatchError,
    PackageGeocodingValidationError,
    PackageHistoricalAttemptLockedError,
    PackageNotFoundError,
    PackageOperationIdConflictError,
    PackageStateConflictError,
} from '../domain/package-errors';
import type {
    MunicipalityGeocodingTarget,
    PackageGeocodingConfigPort,
} from '../application/ports/package-geocoding-config.port';
import type {
    CreateAddressVersionCommand,
    ExistingReviewRecord,
    GeocodingAttemptRecord,
    GeocodingCandidateRecord,
    GeocodingResolutionSnapshot,
    PackageGeocodingRepositoryPort,
    PackageRecordForGeocoding,
    SaveGeocodingReviewCommand,
    UpdateAttemptDecisionCommand,
    UpdatePackageAddressCommand,
} from '../application/ports/package-geocoding-repository.port';
import type {
    AddressCorrectionAuditEntry,
    GeocodingDiagnosticAuditEntry,
    GeocodingReviewAuditEntry,
    PackageGeocodingAuditPort,
} from '../application/ports/package-geocoding-audit.port';
import type {
    PackageGeocodingSession,
    PackageGeocodingUnitOfWorkPort,
} from '../application/ports/package-geocoding.uow.port';
import type {
    FindCandidateRoadNodesQuery,
    NetworkAttachmentPort,
    SavedNetworkAttachmentRecord,
    SaveNetworkAttachmentCommand,
} from '../../geocoding/application/ports/network-attachment.port';
import type { PackageGeocodingDiagnostic } from '../domain/package-geocoding.types';
import { ReviewPackageGeocodingUseCase } from '../application/review-package-geocoding.use-case';

class FakeNetworkAttachmentPort implements NetworkAttachmentPort {
    nodes: Array<{
        nodeId: string;
        datasetId: string;
        latitude: number;
        longitude: number;
        traversableProfiles: readonly (
            'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT'
        )[];
    }> = [];
    savedAttachments: SaveNetworkAttachmentCommand[] = [];

    findCandidateNodes(query: FindCandidateRoadNodesQuery): Promise<
        readonly {
            nodeId: string;
            datasetId: string;
            latitude: number;
            longitude: number;
            traversableProfiles: readonly (
                'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT'
            )[];
        }[]
    > {
        void query;
        return Promise.resolve(this.nodes);
    }

    saveAttachment(
        command: SaveNetworkAttachmentCommand,
    ): Promise<SavedNetworkAttachmentRecord> {
        this.savedAttachments.push(command);
        return Promise.resolve({
            id: 'attachment-review-1',
            tenantId: command.tenantId,
            datasetId: command.datasetId,
            geocodingCandidateId: command.geocodingCandidateId,
            profile: command.profile,
            roadNodeId: command.roadNodeId,
            roadEdgeId: null,
            status: command.status,
            accessDistanceMeters: command.accessDistanceMeters,
        });
    }

    findByCandidateAndProfile(query: {
        tenantId: string;
        geocodingCandidateId: string;
        datasetId: string;
        profile: 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';
    }): Promise<SavedNetworkAttachmentRecord | null> {
        void query;
        return Promise.resolve(null);
    }
}

class FakePackageRepository implements PackageGeocodingRepositoryPort {
    pkg: PackageRecordForGeocoding | null = null;
    attempt: GeocodingAttemptRecord | null = null;
    activeAssignment = false;
    historicalAttempt = false;
    candidates: Map<string, GeocodingCandidateRecord> = new Map();
    reviews: SaveGeocodingReviewCommand[] = [];
    latestReview: ExistingReviewRecord | null = null;
    activeResolution: PackageGeocodingDiagnostic | null = null;
    attemptDecisionUpdate: UpdateAttemptDecisionCommand | null = null;
    operations: Map<
        string,
        {
            operationId: string;
            tenantId: string;
            packageId: string;
            payloadHash: string;
            result: PackageGeocodingDiagnostic;
        }
    > = new Map();

    findOperation(
        tenantId: string,
        operationId: string,
    ): Promise<{
        operationId: string;
        tenantId: string;
        packageId: string;
        payloadHash: string;
        result: PackageGeocodingDiagnostic;
    } | null> {
        const op = this.operations.get(operationId);
        if (op && op.tenantId === tenantId) {
            return Promise.resolve(op);
        }
        return Promise.resolve(null);
    }

    saveOperation(command: {
        operationId: string;
        tenantId: string;
        packageId: string;
        payloadHash: string;
        result: PackageGeocodingDiagnostic;
    }): Promise<void> {
        this.operations.set(command.operationId, command);
        return Promise.resolve();
    }

    findPackageForUpdate(
        tenantId: string,
        packageId: string,
    ): Promise<PackageRecordForGeocoding | null> {
        void tenantId;
        void packageId;
        return Promise.resolve(this.pkg);
    }

    linkGeocodingAttempt(
        tenantId: string,
        packageId: string,
        attemptId: string,
    ): Promise<void> {
        void tenantId;
        void packageId;
        void attemptId;
        return Promise.resolve();
    }

    hasActiveAssignment(tenantId: string, packageId: string): Promise<boolean> {
        void tenantId;
        void packageId;
        return Promise.resolve(this.activeAssignment);
    }

    isAttemptConsumedByRouteStop(
        tenantId: string,
        attemptId: string,
    ): Promise<boolean> {
        void tenantId;
        void attemptId;
        return Promise.resolve(this.historicalAttempt);
    }

    findAttemptById(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingAttemptRecord | null> {
        void tenantId;
        if (this.attempt && this.attempt.id === attemptId) {
            return Promise.resolve(this.attempt);
        }
        return Promise.resolve(null);
    }

    updateAttemptDecision(
        tenantId: string,
        attemptId: string,
        update: UpdateAttemptDecisionCommand,
    ): Promise<void> {
        void tenantId;
        void attemptId;
        this.attemptDecisionUpdate = update;
        if (this.attempt) {
            this.attempt = {
                ...this.attempt,
                selectedCandidateId: update.selectedCandidateId,
                status: update.status,
            };
        }
        return Promise.resolve();
    }

    findCandidateById(
        tenantId: string,
        candidateId: string,
    ): Promise<GeocodingCandidateRecord | null> {
        void tenantId;
        return Promise.resolve(this.candidates.get(candidateId) ?? null);
    }

    findSelectedCandidateForAttempt(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingCandidateRecord | null> {
        void tenantId;
        void attemptId;
        if (!this.attempt?.selectedCandidateId) return Promise.resolve(null);
        return Promise.resolve(
            this.candidates.get(this.attempt.selectedCandidateId) ?? null,
        );
    }

    findResolutionSnapshot(
        tenantId: string,
        packageId: string,
    ): Promise<GeocodingResolutionSnapshot | null> {
        void tenantId;
        void packageId;
        return Promise.resolve(null);
    }

    findLatestReview(
        tenantId: string,
        attemptId: string,
        candidateId: string,
    ): Promise<ExistingReviewRecord | null> {
        void tenantId;
        void attemptId;
        void candidateId;
        return Promise.resolve(this.latestReview);
    }

    saveGeocodingReview(command: SaveGeocodingReviewCommand): Promise<void> {
        this.reviews.push(command);
        return Promise.resolve();
    }

    createAddressVersion(
        command: CreateAddressVersionCommand,
    ): Promise<{ id: string }> {
        void command;
        return Promise.resolve({ id: 'addr-new' });
    }

    updatePackageAddress(command: UpdatePackageAddressCommand): Promise<void> {
        void command;
        return Promise.resolve();
    }
}

class FakeAuditPort implements PackageGeocodingAuditPort {
    reviews: GeocodingReviewAuditEntry[] = [];
    diagnosticAudits: GeocodingDiagnosticAuditEntry[] = [];

    recordDiagnostic(entry: GeocodingDiagnosticAuditEntry): Promise<void> {
        this.diagnosticAudits.push(entry);
        return Promise.resolve();
    }

    recordAddressCorrection(entry: AddressCorrectionAuditEntry): Promise<void> {
        void entry;
        return Promise.resolve();
    }

    recordReview(entry: GeocodingReviewAuditEntry): Promise<void> {
        this.reviews.push(entry);
        return Promise.resolve();
    }
}

class FakeConfigPort implements PackageGeocodingConfigPort {
    target: MunicipalityGeocodingTarget | null = {
        datasetId: 'dataset-1',
        profile: 'MOTOR_VEHICLE',
        maxAcceptanceRadiusMeters: 60,
        maxReviewRadiusMeters: 200,
    };

    findTargetForMunicipality(
        tenantId: string,
        municipalityCode: string,
    ): Promise<MunicipalityGeocodingTarget | null> {
        void tenantId;
        void municipalityCode;
        return Promise.resolve(this.target);
    }
}

class FakeUnitOfWork implements PackageGeocodingUnitOfWorkPort {
    constructor(private readonly session: PackageGeocodingSession) {}

    async runInTransaction<T>(
        _tenantId: string,
        operation: (session: PackageGeocodingSession) => Promise<T>,
    ): Promise<T> {
        return operation(this.session);
    }
}

describe('ReviewPackageGeocodingUseCase', () => {
    let repo: FakePackageRepository;
    let networkAttachmentPort: FakeNetworkAttachmentPort;
    let auditPort: FakeAuditPort;
    let configPort: FakeConfigPort;
    let uow: FakeUnitOfWork;
    let useCase: ReviewPackageGeocodingUseCase;

    const tenantId = 'tenant-1';
    const packageId = 'pkg-1';
    const addressId = 'addr-1';
    const attemptId = 'attempt-1';
    const candidateId = 'cand-1';
    const reviewerUserId = 'user-reviewer-1';
    const correlationId = 'corr-review-1';

    beforeEach(() => {
        repo = new FakePackageRepository();
        networkAttachmentPort = new FakeNetworkAttachmentPort();
        auditPort = new FakeAuditPort();
        configPort = new FakeConfigPort();

        const session: PackageGeocodingSession = {
            registrationPort: {} as never,
            geocodingAddressPort: {} as never,
            geocodingCatalogPort: {} as never,
            geocodingAttemptPort: {} as never,
            networkAttachmentPort,
            packageRepository: repo,
            auditPort,
        };

        uow = new FakeUnitOfWork(session);
        useCase = new ReviewPackageGeocodingUseCase(uow, configPort);

        repo.pkg = {
            id: packageId,
            tenantId,
            state: 'REGISTERED',
            addressId,
            geocodingAttemptId: attemptId,
            originalText: 'Calle 70 # 50 - 20',
            municipalityCode: '08001',
        };

        repo.attempt = {
            id: attemptId,
            tenantId,
            addressId,
            datasetId: 'dataset-1',
            status: 'REVIEW_REQUIRED',
            selectedCandidateId: null,
        };

        repo.candidates.set(candidateId, {
            id: candidateId,
            tenantId,
            attemptId,
            datasetId: 'dataset-1',
            latitude: 10.99,
            longitude: -74.79,
            rank: 1,
            score: 0.96,
        });

        networkAttachmentPort.nodes = [
            {
                nodeId: 'road-node-1',
                datasetId: 'dataset-1',
                latitude: 10.9901,
                longitude: -74.7901,
                traversableProfiles: ['MOTOR_VEHICLE', 'MOTORCYCLE'],
            },
        ];
    });

    it('approves candidate, sets attempt status to MATCHED, saves attachment with null review fields, and records diagnostic audit', async () => {
        const result = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId,
            decision: 'APPROVED',
            reason: 'Address verified on official map',
            reviewerUserId,
            correlationId,
        });

        expect(result.status).toBe('MATCHED');
        expect(result.eligibility).toBe('ELIGIBLE');
        expect(result.selectedCandidateId).toBe(candidateId);
        expect(repo.attemptDecisionUpdate).toEqual({
            selectedCandidateId: candidateId,
            status: 'MATCHED',
        });
        expect(repo.reviews).toHaveLength(1);
        expect(repo.reviews[0].decision).toBe('APPROVED');
        expect(auditPort.reviews).toHaveLength(1);
        expect(auditPort.reviews[0].decision).toBe('APPROVED');
        expect(auditPort.diagnosticAudits).toHaveLength(1);
        expect(auditPort.diagnosticAudits[0].correlationId).toBe(correlationId);
        expect(networkAttachmentPort.savedAttachments).toHaveLength(1);
        expect(
            networkAttachmentPort.savedAttachments[0].reviewedByUserId,
        ).toBeNull();
        expect(
            networkAttachmentPort.savedAttachments[0].reviewReason,
        ).toBeNull();
        expect(networkAttachmentPort.savedAttachments[0].reviewedAt).toBeNull();
    });

    it('rejects candidate, sets attempt status to REVIEW_REQUIRED with null selection, and records diagnostic audit', async () => {
        repo.attempt = {
            ...repo.attempt!,
            selectedCandidateId: candidateId,
            status: 'MATCHED',
        };

        const result = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId,
            decision: 'REJECTED',
            reason: 'Address belongs to another neighborhood',
            reviewerUserId,
            correlationId,
        });

        expect(result.status).toBe('REVIEW_REQUIRED');
        expect(result.eligibility).toBe('INELIGIBLE');
        expect(result.selectedCandidateId).toBeNull();
        expect(repo.attemptDecisionUpdate).toEqual({
            selectedCandidateId: null,
            status: 'REVIEW_REQUIRED',
        });
        expect(repo.reviews[0].decision).toBe('REJECTED');
        expect(auditPort.reviews[0].decision).toBe('REJECTED');
        expect(auditPort.diagnosticAudits).toHaveLength(1);
        expect(auditPort.diagnosticAudits[0].status).toBe('REVIEW_REQUIRED');
        expect(networkAttachmentPort.savedAttachments).toHaveLength(0);
    });

    it('returns existing resolution without duplicating review or attachment when replay occurs', async () => {
        repo.latestReview = {
            id: 'rev-existing-1',
            candidateId,
            decision: 'APPROVED',
        };

        const existingDiagnostic: PackageGeocodingDiagnostic = {
            status: 'MATCHED',
            eligibility: 'ELIGIBLE',
            attemptId,
            selectedCandidateId: candidateId,
            attachmentId: 'att-existing-1',
            attachmentStatus: 'AUTO_ACCEPTED',
            unsuitabilityReason: null,
            datasetId: 'dataset-1',
            profile: 'MOTOR_VEHICLE',
            directedReachabilityVerified: false,
        };

        repo.activeResolution = existingDiagnostic;
        repo.operations.set('op-already-reviewed', {
            operationId: 'op-already-reviewed',
            tenantId,
            packageId,
            payloadHash: JSON.stringify({
                action: 'REVIEW',
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Already reviewed',
            }),
            result: existingDiagnostic,
        });

        const result = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId,
            decision: 'APPROVED',
            reason: 'Already reviewed',
            reviewerUserId,
            correlationId,
            operationId: 'op-already-reviewed',
        });

        expect(result).toEqual(existingDiagnostic);
        expect(repo.reviews).toHaveLength(0);
        expect(networkAttachmentPort.savedAttachments).toHaveLength(0);
    });

    it('rejects review when candidate dataset differs from active municipality target dataset', async () => {
        repo.candidates.set(candidateId, {
            id: candidateId,
            tenantId,
            attemptId,
            datasetId: 'dataset-other',
            latitude: 10.99,
            longitude: -74.79,
            rank: 1,
            score: 0.96,
        });

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageGeocodingValidationError);
    });

    it('rejects review when attempt dataset differs from active municipality target dataset', async () => {
        repo.attempt = {
            ...repo.attempt!,
            datasetId: 'dataset-stale',
        };

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageGeocodingValidationError);
    });

    it('rejects review when attempt is missing on repository', async () => {
        repo.attempt = null;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageGeocodingValidationError);
    });

    it('rejects review when candidate is not found in the attempt', async () => {
        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId: 'non-existent-candidate',
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageGeocodingCandidateNotFoundError);
    });

    it('rejects review when expected attempt reference mismatches', async () => {
        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: 'attempt-stale',
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageGeocodingReferenceMismatchError);
    });

    it('rejects review when attempt is already consumed by a historical route stop', async () => {
        repo.historicalAttempt = true;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageHistoricalAttemptLockedError);
    });

    it('rejects review when package has active route assignment', async () => {
        repo.activeAssignment = true;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageActiveAssignmentConflictError);
    });

    it('rejects review when package is in a non-modifiable state', async () => {
        repo.pkg = { ...repo.pkg!, state: 'ASSIGNED_TO_ROUTE' };

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageStateConflictError);
    });

    it('rejects review when package does not exist', async () => {
        repo.pkg = null;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: 'Reason',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageNotFoundError);
    });

    it('rejects review when reason is empty', async () => {
        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'APPROVED',
                reason: '   ',
                reviewerUserId,
            }),
        ).rejects.toThrow(PackageGeocodingValidationError);
    });

    it('returns selectedCandidateId null when targetConfig is not found without asserting invalid candidateId', async () => {
        configPort.target = null;

        const result = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId: 'unknown-or-unverified-candidate',
            decision: 'APPROVED',
            reason: 'Approve candidate',
            reviewerUserId,
        });

        expect(result.status).toBe('DATASET_NOT_READY');
        expect(result.selectedCandidateId).toBeNull();
    });

    it('replays same review result when operationId is provided', async () => {
        const res1 = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId,
            decision: 'APPROVED',
            reason: 'First review approval',
            reviewerUserId,
            operationId: 'op-rev-1',
        });

        expect(res1.status).toBe('MATCHED');
        expect(repo.reviews).toHaveLength(1);

        const res2 = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId,
            decision: 'APPROVED',
            reason: 'First review approval',
            reviewerUserId,
            operationId: 'op-rev-1',
        });

        expect(res2).toEqual(res1);
        expect(repo.reviews).toHaveLength(1);
    });

    it('rejects replay with PackageOperationIdConflictError when same operationId has different payload', async () => {
        await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId,
            decision: 'APPROVED',
            reason: 'First review approval',
            reviewerUserId,
            operationId: 'op-rev-conflict',
        });

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: addressId,
                expectedAttemptId: attemptId,
                candidateId,
                decision: 'REJECTED',
                reason: 'Different payload rejection',
                reviewerUserId,
                operationId: 'op-rev-conflict',
            }),
        ).rejects.toThrow(PackageOperationIdConflictError);
    });

    it('sequential reviews: approve A -> approve B -> approve A creates separate valid reviews without returning stale active resolution of B', async () => {
        const candidateA: GeocodingCandidateRecord = {
            id: 'cand-a',
            tenantId,
            attemptId,
            datasetId: 'dataset-1',
            latitude: 10.99,
            longitude: -74.79,
            rank: 1,
            score: 1.0,
        };
        const candidateB: GeocodingCandidateRecord = {
            id: 'cand-b',
            tenantId,
            attemptId,
            datasetId: 'dataset-1',
            latitude: 10.995,
            longitude: -74.795,
            rank: 2,
            score: 0.9,
        };
        repo.candidates.set('cand-a', candidateA);
        repo.candidates.set('cand-b', candidateB);

        const resA1 = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId: 'cand-a',
            decision: 'APPROVED',
            reason: 'Approve candidate A',
            reviewerUserId,
        });

        expect(resA1.selectedCandidateId).toBe('cand-a');
        expect(repo.reviews).toHaveLength(1);

        const resB = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId: 'cand-b',
            decision: 'APPROVED',
            reason: 'Approve candidate B',
            reviewerUserId,
        });

        expect(resB.selectedCandidateId).toBe('cand-b');
        expect(repo.reviews).toHaveLength(2);

        const resA2 = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: addressId,
            expectedAttemptId: attemptId,
            candidateId: 'cand-a',
            decision: 'APPROVED',
            reason: 'Re-approve candidate A as intentional choice',
            reviewerUserId,
        });

        expect(resA2.selectedCandidateId).toBe('cand-a');
        expect(repo.reviews).toHaveLength(3);
    });
});
