import {
    PackageActiveAssignmentConflictError,
    PackageGeocodingReferenceMismatchError,
    PackageGeocodingValidationError,
    PackageNotFoundError,
    PackageStateConflictError,
} from '../domain/package-errors';
import type { PackageGeocodingDiagnostic } from '../domain/package-geocoding.types';
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
    AddressCorrectionAuditEntry,
    GeocodingDiagnosticAuditEntry,
    GeocodingReviewAuditEntry,
    PackageGeocodingAuditPort,
} from '../application/ports/package-geocoding-audit.port';
import type {
    PackageGeocodingSession,
    PackageGeocodingUnitOfWorkPort,
} from '../application/ports/package-geocoding.uow.port';
import { CorrectPackageAddressUseCase } from '../application/correct-package-address.use-case';
import type { ResolvePackageGeocodingUseCase } from '../application/resolve-package-geocoding.use-case';

class FakePackageRepository implements PackageGeocodingRepositoryPort {
    pkg: PackageRecordForGeocoding | null = null;
    activeAssignment = false;
    createdAddressVersions: CreateAddressVersionCommand[] = [];
    updatedAddresses: UpdatePackageAddressCommand[] = [];

    findPackageForUpdate(
        tenantId: string,
        packageId: string,
    ): Promise<PackageRecordForGeocoding | null> {
        void tenantId;
        void packageId;
        return Promise.resolve(this.pkg);
    }

    findOperation(
        tenantId: string,
        operationId: string,
    ): Promise<OperationRecord | null> {
        void tenantId;
        void operationId;
        return Promise.resolve(null);
    }

    saveOperation(command: SaveOperationCommand): Promise<void> {
        void command;
        return Promise.resolve();
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
        return Promise.resolve(false);
    }

    findAttemptById(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingAttemptRecord | null> {
        void tenantId;
        void attemptId;
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
        void candidateId;
        return Promise.resolve(null);
    }

    findSelectedCandidateForAttempt(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingCandidateRecord | null> {
        void tenantId;
        void attemptId;
        return Promise.resolve(null);
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
        return Promise.resolve(null);
    }

    saveGeocodingReview(command: SaveGeocodingReviewCommand): Promise<void> {
        void command;
        return Promise.resolve();
    }

    createAddressVersion(
        command: CreateAddressVersionCommand,
    ): Promise<{ id: string }> {
        this.createdAddressVersions.push(command);
        return Promise.resolve({ id: 'addr-version-2' });
    }

    updatePackageAddress(command: UpdatePackageAddressCommand): Promise<void> {
        this.updatedAddresses.push(command);
        if (this.pkg) {
            this.pkg = {
                ...this.pkg,
                addressId: command.addressId,
                geocodingAttemptId: null,
            };
        }
        return Promise.resolve();
    }
}

class FakeAuditPort implements PackageGeocodingAuditPort {
    addressCorrections: AddressCorrectionAuditEntry[] = [];

    recordDiagnostic(entry: GeocodingDiagnosticAuditEntry): Promise<void> {
        void entry;
        return Promise.resolve();
    }

    recordAddressCorrection(entry: AddressCorrectionAuditEntry): Promise<void> {
        this.addressCorrections.push(entry);
        return Promise.resolve();
    }

    recordReview(entry: GeocodingReviewAuditEntry): Promise<void> {
        void entry;
        return Promise.resolve();
    }
}

class FakeResolveGeocodingUseCase {
    diagnostic: PackageGeocodingDiagnostic = {
        status: 'MATCHED',
        eligibility: 'ELIGIBLE',
        attemptId: 'attempt-new-1',
        selectedCandidateId: 'cand-new-1',
        attachmentId: 'att-new-1',
        attachmentStatus: 'AUTO_ACCEPTED',
        unsuitabilityReason: null,
        datasetId: 'dataset-1',
        profile: 'MOTOR_VEHICLE',
        directedReachabilityVerified: false,
    };

    resolvedInputs: unknown[] = [];

    executeInSession(
        session: PackageGeocodingSession,
        input: unknown,
    ): Promise<PackageGeocodingDiagnostic> {
        void session;
        this.resolvedInputs.push(input);
        return Promise.resolve(this.diagnostic);
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

describe('CorrectPackageAddressUseCase', () => {
    let repo: FakePackageRepository;
    let auditPort: FakeAuditPort;
    let resolveGeocoding: FakeResolveGeocodingUseCase;
    let uow: FakeUnitOfWork;
    let useCase: CorrectPackageAddressUseCase;

    const tenantId = 'tenant-1';
    const packageId = 'pkg-1';
    const previousAddressId = 'addr-version-1';
    const actorUserId = 'user-1';

    beforeEach(() => {
        repo = new FakePackageRepository();
        auditPort = new FakeAuditPort();
        resolveGeocoding = new FakeResolveGeocodingUseCase();

        const session: PackageGeocodingSession = {
            registrationPort: {} as never,
            geocodingAddressPort: {} as never,
            geocodingCatalogPort: {} as never,
            geocodingAttemptPort: {} as never,
            networkAttachmentPort: {} as never,
            packageRepository: repo,
            auditPort,
        };

        uow = new FakeUnitOfWork(session);
        useCase = new CorrectPackageAddressUseCase(
            uow,
            resolveGeocoding as unknown as ResolvePackageGeocodingUseCase,
        );

        repo.pkg = {
            id: packageId,
            tenantId,
            state: 'REGISTERED',
            addressId: previousAddressId,
            geocodingAttemptId: 'attempt-old-1',
            originalText: 'Calle 50 # 20 - 10',
            municipalityCode: '08001',
        };
    });

    it('creates new address version, updates package, records audit and resolves geocoding', async () => {
        const result = await useCase.execute({
            tenantId,
            packageId,
            expectedAddressId: previousAddressId,
            expectedAttemptId: 'attempt-old-1',
            newOriginalText: 'Carrera 44 # 60 - 25',
            newMunicipalityCode: '08001',
            reason: 'Customer updated delivery address',
            actorUserId,
        });

        expect(result.packageId).toBe(packageId);
        expect(result.previousAddressId).toBe(previousAddressId);
        expect(result.newAddressId).toBe('addr-version-2');
        expect(result.geocoding.status).toBe('MATCHED');
        expect(repo.createdAddressVersions).toHaveLength(1);
        expect(repo.createdAddressVersions[0].originalText).toBe(
            'Carrera 44 # 60 - 25',
        );
        expect(repo.updatedAddresses).toHaveLength(1);
        expect(repo.updatedAddresses[0].addressId).toBe('addr-version-2');
        expect(repo.updatedAddresses[0].geocodingAttemptId).toBeNull();
        expect(auditPort.addressCorrections).toHaveLength(1);
        expect(auditPort.addressCorrections[0].previousAddressId).toBe(
            previousAddressId,
        );
        expect(auditPort.addressCorrections[0].newAddressId).toBe(
            'addr-version-2',
        );
        expect(resolveGeocoding.resolvedInputs).toHaveLength(1);
    });

    it('rejects correction when expectedAttemptId mismatches current package attempt', async () => {
        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: previousAddressId,
                expectedAttemptId: 'attempt-stale-9',
                newOriginalText: 'Carrera 44 # 60 - 25',
                newMunicipalityCode: '08001',
                reason: 'Customer updated delivery address',
                actorUserId,
            }),
        ).rejects.toThrow(PackageGeocodingReferenceMismatchError);
    });

    it('rejects correction when package has active route assignment', async () => {
        repo.activeAssignment = true;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: previousAddressId,
                newOriginalText: 'Carrera 44 # 60 - 25',
                newMunicipalityCode: '08001',
                reason: 'Customer updated delivery address',
                actorUserId,
            }),
        ).rejects.toThrow(PackageActiveAssignmentConflictError);
    });

    it('rejects correction when package is in illegal state', async () => {
        repo.pkg = { ...repo.pkg!, state: 'OUT_FOR_DELIVERY' };

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: previousAddressId,
                newOriginalText: 'Carrera 44 # 60 - 25',
                newMunicipalityCode: '08001',
                reason: 'Customer updated delivery address',
                actorUserId,
            }),
        ).rejects.toThrow(PackageStateConflictError);
    });

    it('rejects correction when expected address reference mismatches', async () => {
        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: 'addr-wrong',
                newOriginalText: 'Carrera 44 # 60 - 25',
                newMunicipalityCode: '08001',
                reason: 'Customer updated delivery address',
                actorUserId,
            }),
        ).rejects.toThrow(PackageGeocodingReferenceMismatchError);
    });

    it('rejects correction when package does not exist', async () => {
        repo.pkg = null;

        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: previousAddressId,
                newOriginalText: 'Carrera 44 # 60 - 25',
                newMunicipalityCode: '08001',
                reason: 'Reason',
                actorUserId,
            }),
        ).rejects.toThrow(PackageNotFoundError);
    });

    it('rejects correction when new address text is empty', async () => {
        await expect(
            useCase.execute({
                tenantId,
                packageId,
                expectedAddressId: previousAddressId,
                newOriginalText: '  ',
                newMunicipalityCode: '08001',
                reason: 'Reason',
                actorUserId,
            }),
        ).rejects.toThrow(PackageGeocodingValidationError);
    });
});
