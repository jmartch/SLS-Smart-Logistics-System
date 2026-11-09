import type { PublicTrackingTokenGenerator } from '../application/ports/public-tracking-token.port';
import type {
    PackageRegistrationContext,
    PackageRegistrationData,
    PackageRegistrationPort,
    PackageReferenceQuery,
    PackageReferenceSnapshot,
    RegisterPackageOutcome,
} from '../application/ports/package-registration.port';
import type {
    PackageGeocodingSession,
    PackageGeocodingUnitOfWorkPort,
} from '../application/ports/package-geocoding.uow.port';
import type { PackageGeocodingDiagnostic } from '../domain/package-geocoding.types';
import { RegisterAndGeocodePackageUseCase } from '../application/register-and-geocode-package.use-case';
import type { ResolvePackageGeocodingUseCase } from '../application/resolve-package-geocoding.use-case';

class FakePublicTokenGenerator implements PublicTrackingTokenGenerator {
    generate(): string {
        return 'token-abc-123';
    }
}

class FakeRegistrationPort implements PackageRegistrationPort {
    referenceSnapshot: PackageReferenceSnapshot = {
        shipmentType: { active: true },
        zone: { id: '22222222-2222-4222-8222-222222222222' },
        sector: { zoneId: '22222222-2222-4222-8222-222222222222' },
    };

    outcome: RegisterPackageOutcome = {
        ok: true,
        package: {
            id: 'pkg-registered-1',
            tenantId: 'tenant-1',
            trackingCode: 'TRK-001',
            publicTrackingToken: 'token-abc-123',
            state: 'REGISTERED',
            addressId: 'addr-1',
            shipmentTypeId: 'shipment-1',
            zoneId: 'zone-1',
            sectorId: 'sector-1',
            weightKg: '2.500',
            lengthCm: '10.00',
            widthCm: '10.00',
            heightCm: '10.00',
            volumeM3: '0.001000',
            priority: 'NORMAL',
            deadline: null,
            serviceDurationSeconds: null,
        },
    };

    loadReferences(
        tenantId: string,
        query: PackageReferenceQuery,
    ): Promise<PackageReferenceSnapshot> {
        void tenantId;
        void query;
        return Promise.resolve(this.referenceSnapshot);
    }

    registerByTenant(
        context: PackageRegistrationContext,
        data: PackageRegistrationData,
        publicTrackingToken: string,
    ): Promise<RegisterPackageOutcome> {
        void context;
        void data;
        void publicTrackingToken;
        return Promise.resolve(this.outcome);
    }
}

class FakeResolveGeocodingUseCase {
    diagnostic: PackageGeocodingDiagnostic = {
        status: 'MATCHED',
        eligibility: 'ELIGIBLE',
        attemptId: 'attempt-1',
        selectedCandidateId: 'cand-1',
        attachmentId: 'att-1',
        attachmentStatus: 'AUTO_ACCEPTED',
        unsuitabilityReason: null,
        datasetId: 'dataset-1',
        profile: 'MOTOR_VEHICLE',
        directedReachabilityVerified: false,
    };

    executeInSession(
        session: PackageGeocodingSession,
        input: unknown,
    ): Promise<PackageGeocodingDiagnostic> {
        void session;
        void input;
        return Promise.resolve(this.diagnostic);
    }
}

class FakeUnitOfWork implements PackageGeocodingUnitOfWorkPort {
    rolledBack = false;

    constructor(private readonly registrationPort: FakeRegistrationPort) {}

    async runInTransaction<T>(
        _tenantId: string,
        operation: (session: PackageGeocodingSession) => Promise<T>,
    ): Promise<T> {
        const session: PackageGeocodingSession = {
            registrationPort: this.registrationPort,
            geocodingAddressPort: {} as never,
            geocodingCatalogPort: {} as never,
            geocodingAttemptPort: {} as never,
            networkAttachmentPort: {} as never,
            packageRepository: {} as never,
            auditPort: {} as never,
        };

        try {
            return await operation(session);
        } catch (error) {
            this.rolledBack = true;
            throw error;
        }
    }
}

describe('RegisterAndGeocodePackageUseCase', () => {
    let registrationPort: FakeRegistrationPort;
    let uow: FakeUnitOfWork;
    let tokens: FakePublicTokenGenerator;
    let resolveGeocoding: FakeResolveGeocodingUseCase;
    let useCase: RegisterAndGeocodePackageUseCase;

    const context: PackageRegistrationContext = {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        correlationId: 'corr-1',
    };

    const validPayload = {
        trackingCode: 'TRK-001',
        shipmentTypeId: '11111111-1111-4111-8111-111111111111',
        zoneId: '22222222-2222-4222-8222-222222222222',
        sectorId: '33333333-3333-4333-8333-333333333333',
        weightKg: '5',
        lengthCm: '20',
        widthCm: '20',
        heightCm: '20',
        address: {
            text: 'Calle 50 # 40 - 30',
            municipalityCode: '08001',
        },
    };

    beforeEach(() => {
        registrationPort = new FakeRegistrationPort();
        uow = new FakeUnitOfWork(registrationPort);
        tokens = new FakePublicTokenGenerator();
        resolveGeocoding = new FakeResolveGeocodingUseCase();

        useCase = new RegisterAndGeocodePackageUseCase(
            uow,
            tokens,
            resolveGeocoding as unknown as ResolvePackageGeocodingUseCase,
        );
    });

    it('registers package and resolves geocoding within transaction', async () => {
        const result = await useCase.execute(context, validPayload);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.package.id).toBe('pkg-registered-1');
            expect(result.geocoding.status).toBe('MATCHED');
            expect(result.geocoding.eligibility).toBe('ELIGIBLE');
        }
    });

    it('returns registration error without resolving geocoding when references fail', async () => {
        registrationPort.referenceSnapshot = {
            shipmentType: null,
            zone: { id: '22222222-2222-4222-8222-222222222222' },
            sector: { zoneId: '22222222-2222-4222-8222-222222222222' },
        };

        const result = await useCase.execute(context, validPayload);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('PACKAGE_SHIPMENT_TYPE_NOT_FOUND');
        }
    });

    it('returns registration conflict when tracking code already exists', async () => {
        registrationPort.outcome = {
            ok: false,
            code: 'PACKAGE_TRACKING_CODE_CONFLICT',
        };

        const result = await useCase.execute(context, validPayload);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe('PACKAGE_TRACKING_CODE_CONFLICT');
        }
    });

    it('rolls back transaction when technical error occurs during resolution', async () => {
        resolveGeocoding.executeInSession = () => {
            return Promise.reject(new Error('Database transaction timeout'));
        };

        await expect(useCase.execute(context, validPayload)).rejects.toThrow(
            'Database transaction timeout',
        );
        expect(uow.rolledBack).toBe(true);
    });

    it('preserves registered package when geocoding produces business negative result', async () => {
        resolveGeocoding.diagnostic = {
            status: 'NOT_FOUND',
            eligibility: 'INELIGIBLE',
            attemptId: 'attempt-neg-1',
            selectedCandidateId: null,
            attachmentId: null,
            attachmentStatus: null,
            unsuitabilityReason: 'No candidates found',
            datasetId: 'dataset-1',
            profile: 'MOTOR_VEHICLE',
            directedReachabilityVerified: false,
        };

        const result = await useCase.execute(context, validPayload);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.package.state).toBe('REGISTERED');
            expect(result.geocoding.status).toBe('NOT_FOUND');
            expect(result.geocoding.eligibility).toBe('INELIGIBLE');
        }
    });
});
