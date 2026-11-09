import {
    PackageGeocodingValidationError,
    PackageNotFoundError,
    PackageOperationIdConflictError,
} from '../domain/package-errors';
import type { PackageGeocodingDiagnostic } from '../domain/package-geocoding.types';
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
import type {
    FindGeocodingAddressQuery,
    GeocodingAddress,
    GeocodingAddressPort,
} from '../../geocoding/application/ports/geocoding-address.port';
import type {
    FindGeocodingCandidatesQuery,
    GeocodingCatalogPort,
    ReadyGeocodingCatalog,
} from '../../geocoding/application/ports/geocoding-catalog.port';
import type {
    GeocodingAttemptPort,
    SavedGeocodingAttempt,
    SaveGeocodingAttemptCommand,
} from '../../geocoding/application/ports/geocoding-attempt.port';
import type {
    PackageReferenceQuery,
    PackageReferenceSnapshot,
    PackageRegistrationContext,
    PackageRegistrationData,
    PackageRegistrationPort,
    RegisterPackageOutcome,
} from '../application/ports/package-registration.port';
import { ResolvePackageGeocodingUseCase } from '../application/resolve-package-geocoding.use-case';

class FakeRegistrationPort implements PackageRegistrationPort {
    loadReferences(
        tenantId: string,
        query: PackageReferenceQuery,
    ): Promise<PackageReferenceSnapshot> {
        void tenantId;
        void query;
        return Promise.resolve({
            shipmentType: { active: true },
            zone: { id: 'zone-1' },
            sector: { zoneId: 'zone-1' },
        });
    }

    registerByTenant(
        context: PackageRegistrationContext,
        data: PackageRegistrationData,
        publicTrackingToken: string,
    ): Promise<RegisterPackageOutcome> {
        void context;
        void data;
        void publicTrackingToken;
        return Promise.reject(new Error('Not used in this test suite'));
    }
}

class FakeAddressPort implements GeocodingAddressPort {
    address: GeocodingAddress | null = null;

    findByTenant(
        query: FindGeocodingAddressQuery,
    ): Promise<GeocodingAddress | null> {
        void query;
        return Promise.resolve(this.address);
    }
}

class FakeCatalogPort implements GeocodingCatalogPort {
    catalog: ReadyGeocodingCatalog | null = null;

    findCandidates(
        query: FindGeocodingCandidatesQuery,
    ): Promise<ReadyGeocodingCatalog | null> {
        void query;
        return Promise.resolve(this.catalog);
    }
}

class FakeAttemptPort implements GeocodingAttemptPort {
    attempts: SaveGeocodingAttemptCommand[] = [];

    saveAtomically(
        command: SaveGeocodingAttemptCommand,
    ): Promise<SavedGeocodingAttempt> {
        this.attempts.push(command);
        return Promise.resolve({
            attemptId: 'attempt-saved-1',
            selectedCandidateId: command.decision.selectedReferenceId
                ? 'candidate-saved-1'
                : null,
        });
    }
}

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
            id: 'attachment-saved-1',
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

class FakePackageGeocodingRepository implements PackageGeocodingRepositoryPort {
    pkg: PackageRecordForGeocoding | null = null;
    attempt: GeocodingAttemptRecord | null = null;
    activeAssignment = false;
    historicalAttempt = false;
    linkedAttemptId: string | null = null;
    selectedCandidate: GeocodingCandidateRecord | null = null;
    activeResolutionSnapshot: GeocodingResolutionSnapshot | null = null;
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
        this.linkedAttemptId = attemptId;
        if (this.pkg) {
            this.pkg = { ...this.pkg, geocodingAttemptId: attemptId };
        }
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
        void update;
        return Promise.resolve();
    }

    findCandidateById(
        tenantId: string,
        candidateId: string,
    ): Promise<GeocodingCandidateRecord | null> {
        void tenantId;
        if (
            this.selectedCandidate &&
            this.selectedCandidate.id === candidateId
        ) {
            return Promise.resolve(this.selectedCandidate);
        }
        return Promise.resolve(null);
    }

    findSelectedCandidateForAttempt(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingCandidateRecord | null> {
        void tenantId;
        void attemptId;
        return Promise.resolve(this.selectedCandidate);
    }

    findResolutionSnapshot(
        tenantId: string,
        packageId: string,
    ): Promise<GeocodingResolutionSnapshot | null> {
        void tenantId;
        void packageId;
        return Promise.resolve(this.activeResolutionSnapshot);
    }

    findLatestReview(
        tenantId: string,
        attemptId: string,
        candidateId: string,
    ): Promise<ExistingReviewRecord | null> {
        void tenantId;
        void attemptId;
        void candidateId;
        return Promise.resolve(null);
    }

    saveGeocodingReview(command: SaveGeocodingReviewCommand): Promise<void> {
        void command;
        return Promise.resolve();
    }

    createAddressVersion(
        command: CreateAddressVersionCommand,
    ): Promise<{ id: string }> {
        void command;
        return Promise.resolve({ id: 'addr-new-1' });
    }

    updatePackageAddress(command: UpdatePackageAddressCommand): Promise<void> {
        void command;
        return Promise.resolve();
    }
}

class FakeAuditPort implements PackageGeocodingAuditPort {
    diagnosticAudits: GeocodingDiagnosticAuditEntry[] = [];
    addressCorrectionAudits: AddressCorrectionAuditEntry[] = [];
    reviewAudits: GeocodingReviewAuditEntry[] = [];

    recordDiagnostic(entry: GeocodingDiagnosticAuditEntry): Promise<void> {
        this.diagnosticAudits.push(entry);
        return Promise.resolve();
    }

    recordAddressCorrection(entry: AddressCorrectionAuditEntry): Promise<void> {
        this.addressCorrectionAudits.push(entry);
        return Promise.resolve();
    }

    recordReview(entry: GeocodingReviewAuditEntry): Promise<void> {
        this.reviewAudits.push(entry);
        return Promise.resolve();
    }
}

class FakeConfigPort implements PackageGeocodingConfigPort {
    target: MunicipalityGeocodingTarget | null = {
        datasetId: 'dataset-1',
        profile: 'MOTOR_VEHICLE',
        maxAcceptanceRadiusMeters: 50,
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
    constructor(readonly session: PackageGeocodingSession) {}

    async runInTransaction<T>(
        _tenantId: string,
        operation: (session: PackageGeocodingSession) => Promise<T>,
    ): Promise<T> {
        return operation(this.session);
    }
}

describe('ResolvePackageGeocodingUseCase', () => {
    let registrationPort: FakeRegistrationPort;
    let addressPort: FakeAddressPort;
    let catalogPort: FakeCatalogPort;
    let attemptPort: FakeAttemptPort;
    let networkAttachmentPort: FakeNetworkAttachmentPort;
    let packageRepo: FakePackageGeocodingRepository;
    let auditPort: FakeAuditPort;
    let configPort: FakeConfigPort;
    let session: PackageGeocodingSession;
    let uow: FakeUnitOfWork;
    let useCase: ResolvePackageGeocodingUseCase;

    const tenantId = 'tenant-1';
    const packageId = 'pkg-1';
    const addressId = 'addr-1';
    const actorUserId = 'user-1';

    beforeEach(() => {
        registrationPort = new FakeRegistrationPort();
        addressPort = new FakeAddressPort();
        catalogPort = new FakeCatalogPort();
        attemptPort = new FakeAttemptPort();
        networkAttachmentPort = new FakeNetworkAttachmentPort();
        packageRepo = new FakePackageGeocodingRepository();
        auditPort = new FakeAuditPort();
        configPort = new FakeConfigPort();

        session = {
            registrationPort,
            geocodingAddressPort: addressPort,
            geocodingCatalogPort: catalogPort,
            geocodingAttemptPort: attemptPort,
            networkAttachmentPort,
            packageRepository: packageRepo,
            auditPort,
        };

        uow = new FakeUnitOfWork(session);
        useCase = new ResolvePackageGeocodingUseCase(configPort, uow);

        packageRepo.pkg = {
            id: packageId,
            tenantId,
            state: 'REGISTERED',
            addressId,
            geocodingAttemptId: null,
            originalText: 'Calle 72 # 54 - 30',
            municipalityCode: '08001',
        };

        addressPort.address = {
            id: addressId,
            tenantId,
            originalText: 'Calle 72 # 54 - 30',
            municipalityCode: '08001',
        };
    });

    it('returns existing resolution without creating attempt when replay occurs', async () => {
        packageRepo.pkg = {
            ...packageRepo.pkg!,
            geocodingAttemptId: 'attempt-prev-1',
        };

        const existingDiagnostic: PackageGeocodingDiagnostic = {
            status: 'MATCHED',
            eligibility: 'ELIGIBLE',
            attemptId: 'attempt-prev-1',
            selectedCandidateId: 'cand-prev-1',
            attachmentId: 'att-prev-1',
            attachmentStatus: 'AUTO_ACCEPTED',
            unsuitabilityReason: null,
            datasetId: 'dataset-1',
            profile: 'MOTOR_VEHICLE',
            directedReachabilityVerified: false,
        };

        packageRepo.activeResolutionSnapshot = {
            attemptId: 'attempt-prev-1',
            attemptStatus: 'MATCHED',
            attemptDatasetId: 'dataset-1',
            isDatasetReady: true,
            selectedCandidateId: 'cand-prev-1',
            networkAttachments: [
                {
                    id: 'att-prev-1',
                    datasetId: 'dataset-1',
                    profile: 'MOTOR_VEHICLE',
                    status: 'AUTO_ACCEPTED',
                    accessDistanceMeters: 10,
                },
            ],
        };

        const result = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
            forceRetry: false,
        });

        expect(result).toEqual(existingDiagnostic);
        expect(attemptPort.attempts).toHaveLength(0);
    });

    it('throws PackageGeocodingValidationError when address is missing on the address port', async () => {
        addressPort.address = null;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                addressId,
                actorUserId,
            }),
        ).rejects.toThrow(PackageGeocodingValidationError);
    });

    it('returns DATASET_NOT_READY without persisting an attempt when no dataset is configured', async () => {
        configPort.target = null;

        const result: PackageGeocodingDiagnostic = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
        });

        expect(result.status).toBe('DATASET_NOT_READY');
        expect(result.eligibility).toBe('INELIGIBLE');
        expect(result.attemptId).toBeNull();
        expect(attemptPort.attempts).toHaveLength(0);
        expect(packageRepo.linkedAttemptId).toBeNull();
        expect(auditPort.diagnosticAudits).toHaveLength(1);
        expect(auditPort.diagnosticAudits[0].status).toBe('DATASET_NOT_READY');
    });

    it('returns UNSUPPORTED_ADDRESS_FORMAT without persisting an attempt when address cannot be normalized', async () => {
        packageRepo.pkg = {
            ...packageRepo.pkg!,
            originalText: 'Direccion Invalida Sin Componentes',
        };
        addressPort.address = {
            ...addressPort.address!,
            originalText: 'Direccion Invalida Sin Componentes',
        };

        const result = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
        });

        expect(result.status).toBe('UNSUPPORTED_ADDRESS_FORMAT');
        expect(result.eligibility).toBe('INELIGIBLE');
        expect(result.attemptId).toBeNull();
        expect(attemptPort.attempts).toHaveLength(0);
        expect(packageRepo.linkedAttemptId).toBeNull();
        expect(auditPort.diagnosticAudits).toHaveLength(1);
        expect(auditPort.diagnosticAudits[0].status).toBe(
            'UNSUPPORTED_ADDRESS_FORMAT',
        );
    });

    it('links negative attempt and returns NOT_FOUND when catalog yields no candidates', async () => {
        catalogPort.catalog = {
            datasetId: 'dataset-1',
            references: [],
        };

        const result = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
        });

        expect(result.status).toBe('NOT_FOUND');
        expect(result.eligibility).toBe('INELIGIBLE');
        expect(result.attemptId).toBe('attempt-saved-1');
        expect(packageRepo.linkedAttemptId).toBe('attempt-saved-1');
        expect(auditPort.diagnosticAudits[0].status).toBe('NOT_FOUND');
    });

    it('links negative attempt and returns REVIEW_REQUIRED when geocoding is ambiguous', async () => {
        catalogPort.catalog = {
            datasetId: 'dataset-1',
            references: [
                {
                    referenceId: 'ref-1',
                    datasetId: 'dataset-1',
                    municipalityCode: '08001',
                    normalizedAddress: 'CL 72 54 30',
                    components: {
                        streetType: 'CALLE',
                        streetIdentifier: '72',
                        generatingRoad: '54',
                        plateNumber: '30',
                        neighborhood: null,
                    },
                    precision: 'ENTRANCE',
                    latitude: 10.99,
                    longitude: -74.79,
                },
                {
                    referenceId: 'ref-2',
                    datasetId: 'dataset-1',
                    municipalityCode: '08001',
                    normalizedAddress: 'CL 72 54 30',
                    components: {
                        streetType: 'CALLE',
                        streetIdentifier: '72',
                        generatingRoad: '54',
                        plateNumber: '30',
                        neighborhood: null,
                    },
                    precision: 'ENTRANCE',
                    latitude: 10.991,
                    longitude: -74.791,
                },
            ],
        };

        const result = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
        });

        expect(result.status).toBe('REVIEW_REQUIRED');
        expect(result.eligibility).toBe('INELIGIBLE');
        expect(result.attemptId).toBe('attempt-saved-1');
        expect(packageRepo.linkedAttemptId).toBe('attempt-saved-1');
    });

    it('evaluates road network and returns MATCHED ELIGIBLE with null review metadata in attachment', async () => {
        catalogPort.catalog = {
            datasetId: 'dataset-1',
            references: [
                {
                    referenceId: 'ref-1',
                    datasetId: 'dataset-1',
                    municipalityCode: '08001',
                    normalizedAddress: 'CL 72 54 30',
                    components: {
                        streetType: 'CALLE',
                        streetIdentifier: '72',
                        generatingRoad: '54',
                        plateNumber: '30',
                        neighborhood: null,
                    },
                    precision: 'ENTRANCE',
                    latitude: 10.99,
                    longitude: -74.79,
                },
            ],
        };

        packageRepo.selectedCandidate = {
            id: 'candidate-saved-1',
            tenantId,
            attemptId: 'attempt-saved-1',
            datasetId: 'dataset-1',
            latitude: 10.99,
            longitude: -74.79,
            rank: 1,
            score: 1.0,
        };

        networkAttachmentPort.nodes = [
            {
                nodeId: 'road-node-1',
                datasetId: 'dataset-1',
                latitude: 10.99005,
                longitude: -74.79005,
                traversableProfiles: ['MOTOR_VEHICLE', 'MOTORCYCLE'],
            },
        ];

        const result = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
        });

        expect(result.status).toBe('MATCHED');
        expect(result.eligibility).toBe('ELIGIBLE');
        expect(result.attemptId).toBe('attempt-saved-1');
        expect(result.selectedCandidateId).toBe('candidate-saved-1');
        expect(result.attachmentId).toBe('attachment-saved-1');
        expect(result.attachmentStatus).toBe('AUTO_ACCEPTED');
        expect(networkAttachmentPort.savedAttachments).toHaveLength(1);
        expect(
            networkAttachmentPort.savedAttachments[0].reviewedByUserId,
        ).toBeNull();
        expect(
            networkAttachmentPort.savedAttachments[0].reviewReason,
        ).toBeNull();
        expect(networkAttachmentPort.savedAttachments[0].reviewedAt).toBeNull();
    });

    it('returns NETWORK_ATTACHMENT_NOT_READY when candidate exceeds road acceptance radius', async () => {
        catalogPort.catalog = {
            datasetId: 'dataset-1',
            references: [
                {
                    referenceId: 'ref-1',
                    datasetId: 'dataset-1',
                    municipalityCode: '08001',
                    normalizedAddress: 'CL 72 54 30',
                    components: {
                        streetType: 'CALLE',
                        streetIdentifier: '72',
                        generatingRoad: '54',
                        plateNumber: '30',
                        neighborhood: null,
                    },
                    precision: 'ENTRANCE',
                    latitude: 10.99,
                    longitude: -74.79,
                },
            ],
        };

        packageRepo.selectedCandidate = {
            id: 'candidate-saved-1',
            tenantId,
            attemptId: 'attempt-saved-1',
            datasetId: 'dataset-1',
            latitude: 10.99,
            longitude: -74.79,
            rank: 1,
            score: 1.0,
        };

        networkAttachmentPort.nodes = [
            {
                nodeId: 'road-node-far',
                datasetId: 'dataset-1',
                latitude: 10.991,
                longitude: -74.791,
                traversableProfiles: ['MOTOR_VEHICLE', 'MOTORCYCLE'],
            },
        ];

        const result = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
        });

        expect(result.status).toBe('NETWORK_ATTACHMENT_NOT_READY');
        expect(result.eligibility).toBe('INELIGIBLE');
        expect(result.attachmentStatus).toBe('REVIEW_REQUIRED');
        expect(result.unsuitabilityReason).toBe(
            'ACCESS_DISTANCE_EXCEEDS_ACCEPTANCE_RADIUS',
        );
    });

    it('throws error when selected candidate is inconsistent with target dataset', async () => {
        catalogPort.catalog = {
            datasetId: 'dataset-1',
            references: [
                {
                    referenceId: 'ref-1',
                    datasetId: 'dataset-1',
                    municipalityCode: '08001',
                    normalizedAddress: 'CL 72 54 30',
                    components: {
                        streetType: 'CALLE',
                        streetIdentifier: '72',
                        generatingRoad: '54',
                        plateNumber: '30',
                        neighborhood: null,
                    },
                    precision: 'ENTRANCE',
                    latitude: 10.99,
                    longitude: -74.79,
                },
            ],
        };

        packageRepo.selectedCandidate = {
            id: 'candidate-saved-1',
            tenantId,
            attemptId: 'attempt-saved-1',
            datasetId: 'dataset-incompatible',
            latitude: 10.99,
            longitude: -74.79,
            rank: 1,
            score: 1.0,
        };

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                addressId,
                actorUserId,
            }),
        ).rejects.toThrow();
    });

    it('throws PackageNotFoundError when package is missing', async () => {
        packageRepo.pkg = null;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                addressId,
                actorUserId,
            }),
        ).rejects.toThrow(PackageNotFoundError);
    });

    it('replays same result when called with same operationId without repeating execution', async () => {
        catalogPort.catalog = {
            datasetId: 'dataset-1',
            references: [
                {
                    referenceId: 'ref-1',
                    datasetId: 'dataset-1',
                    municipalityCode: '08001',
                    normalizedAddress: 'CL 72 54 30',
                    components: {
                        streetType: 'CALLE',
                        streetIdentifier: '72',
                        generatingRoad: '54',
                        plateNumber: '30',
                        neighborhood: null,
                    },
                    precision: 'ENTRANCE',
                    latitude: 10.99,
                    longitude: -74.79,
                },
            ],
        };

        networkAttachmentPort.nodes = [
            {
                nodeId: 'road-node-1',
                datasetId: 'dataset-1',
                latitude: 10.9901,
                longitude: -74.7901,
                traversableProfiles: ['MOTOR_VEHICLE', 'MOTORCYCLE'],
            },
        ];

        packageRepo.selectedCandidate = {
            id: 'candidate-saved-1',
            tenantId,
            attemptId: 'attempt-saved-1',
            datasetId: 'dataset-1',
            latitude: 10.99,
            longitude: -74.79,
            rank: 1,
            score: 1.0,
        };

        const res1 = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
            operationId: 'op-123',
        });

        expect(res1.status).toBe('MATCHED');
        expect(attemptPort.attempts).toHaveLength(1);

        const res2 = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
            operationId: 'op-123',
        });

        expect(res2).toEqual(res1);
        expect(attemptPort.attempts).toHaveLength(1);
    });

    it('rejects with PackageOperationIdConflictError when same operationId has different payload', async () => {
        catalogPort.catalog = {
            datasetId: 'dataset-1',
            references: [],
        };

        await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
            operationId: 'op-conflict-test',
        });

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                addressId: 'different-address-id',
                actorUserId,
                operationId: 'op-conflict-test',
            }),
        ).rejects.toThrow(PackageOperationIdConflictError);
    });

    it('does not declare cached resolution eligible if municipality target dataset or profile has changed', async () => {
        packageRepo.pkg = {
            id: packageId,
            tenantId,
            state: 'REGISTERED',
            addressId,
            geocodingAttemptId: 'attempt-old-1',
            originalText: 'Calle 72 # 54 - 30',
            municipalityCode: '08001',
        };

        packageRepo.activeResolutionSnapshot = {
            attemptStatus: 'MATCHED',
            attemptId: 'attempt-old-1',
            selectedCandidateId: 'candidate-1',
            attemptDatasetId: 'dataset-old',
            isDatasetReady: true,
            networkAttachments: [
                {
                    id: 'att-1',
                    datasetId: 'dataset-old',
                    profile: 'MOTOR_VEHICLE',
                    status: 'AUTO_ACCEPTED',
                    accessDistanceMeters: 10,
                },
            ],
        };

        configPort.target = {
            datasetId: 'dataset-new',
            profile: 'MOTOR_VEHICLE',
            maxAcceptanceRadiusMeters: 50,
        };

        catalogPort.catalog = {
            datasetId: 'dataset-new',
            references: [],
        };

        const res = await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
        });

        expect(res.status).toBe('NOT_FOUND');
        expect(res.datasetId).toBe('dataset-new');
    });

    it('calls findOperation before findPackageForUpdate to enforce consistent lock acquisition order', async () => {
        const spyFindOp = jest.spyOn(packageRepo, 'findOperation');
        const spyFindPkg = jest.spyOn(packageRepo, 'findPackageForUpdate');

        await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
            operationId: 'op-order-test',
        });

        const opOrder = spyFindOp.mock.invocationCallOrder[0];
        const pkgOrder = spyFindPkg.mock.invocationCallOrder[0];
        expect(opOrder).toBeDefined();
        expect(pkgOrder).toBeDefined();
        expect(opOrder).toBeLessThan(pkgOrder);
    });

    it('distinguishes undefined versus null expectedAttemptId in operation fingerprint and throws conflict', async () => {
        await useCase.execute({
            tenantId,
            packageId,
            addressId,
            actorUserId,
            operationId: 'op-attempt-fingerprint-test',
            expectedAttemptId: null,
        });

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                addressId,
                actorUserId,
                operationId: 'op-attempt-fingerprint-test',
                expectedAttemptId: undefined,
            }),
        ).rejects.toBeInstanceOf(PackageOperationIdConflictError);
    });
});
