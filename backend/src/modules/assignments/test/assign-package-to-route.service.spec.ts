import { AssignPackageToRouteService } from '../application/assign-package-to-route.service';
import type {
    AssignmentReservationRepository,
    AssignmentValidationCallback,
    ReservationRequest,
} from '../domain/reservation.repository';
import type { AssignmentValidationContext } from '../domain/validation.types';

function createContext(): AssignmentValidationContext {
    return {
        tenantId: 'tenant-a',
        hasDuplicateAssignment: false,
        planning: { datasetId: 'dataset-1', profile: 'MOTOR_VEHICLE' },
        geocoding: {
            tenantId: 'tenant-a',
            addressId: 'address-1',
            datasetId: 'dataset-1',
            datasetStatus: 'READY',
            status: 'MATCHED',
            selectedCandidateId: 'candidate-1',
            latitude: 11.0041,
            longitude: -74.807,
        },
        networkAttachment: {
            tenantId: 'tenant-a',
            datasetId: 'dataset-1',
            geocodingCandidateId: 'candidate-1',
            profile: 'MOTOR_VEHICLE',
            status: 'AUTO_ACCEPTED',
            roadNodeId: 'node-1',
            roadEdgeId: null,
        },
        package: {
            id: 'package-1',
            tenantId: 'tenant-a',
            recipientAddress: 'Calle 84 # 50-20',
            zoneId: 'zone-north',
            addressId: 'address-1',
            weightGrams: 10000,
            volumeCm3: 200000,
            weightKg: 10,
            volumeM3: 0.2,
        },
        vehicle: {
            id: 'vehicle-1',
            tenantId: 'tenant-a',
            available: true,
            remainingWeightGrams: 100000,
            remainingVolumeCm3: 5000000,
            remainingWeightKg: 100,
            remainingVolumeM3: 5,
        },
        courier: {
            id: 'courier-1',
            tenantId: 'tenant-a',
            available: true,
        },
    };
}

describe('AssignPackageToRouteService', () => {
    function createService(context = createContext()) {
        const reserve = jest.fn();
        const reserveValidated = jest.fn(
            (
                _request: ReservationRequest,
                _profile: string,
                validate: AssignmentValidationCallback,
            ) => {
                const validation = validate(context);
                return Promise.resolve(
                    validation.ok
                        ? {
                            kind: 'ASSIGNED' as const,
                            assignmentId: 'assignment-1',
                        }
                        : {
                            kind: 'PENDING_ASSIGNMENT' as const,
                            reason: validation.code,
                            rejectedBy: validation.handler,
                            message: validation.message,
                        },
                );
            },
        );
        const repository = {
            reserve,
            reserveValidated,
        } as unknown as AssignmentReservationRepository;

        return {
            reserve,
            reserveValidated,
            service: new AssignPackageToRouteService(repository),
        };
    }

    it('sends identifiers and profile to the transactional repository', async () => {
        const { reserve, reserveValidated, service } = createService();

        await expect(
            service.execute({
                tenantId: 'tenant-a',
                packageId: 'package-1',
                routeId: 'route-1',
                profile: 'MOTOR_VEHICLE',
                routeStopId: 'stop-1',
                responsibleUserId: 'user-1',
            }),
        ).resolves.toEqual({
            kind: 'ASSIGNED',
            assignmentId: 'assignment-1',
        });

        expect(reserveValidated).toHaveBeenCalledWith(
            {
                tenantId: 'tenant-a',
                packageId: 'package-1',
                routeId: 'route-1',
                routeStopId: 'stop-1',
                responsibleUserId: 'user-1',
            },
            'MOTOR_VEHICLE',
            expect.any(Function),
        );
        expect(reserve).not.toHaveBeenCalled();
    });

    it.each(['geocoding', 'networkAttachment'] as const)(
        'returns pending when trusted %s data is missing',
        async (field) => {
            const { service } = createService({
                ...createContext(),
                [field]: null,
            });

            await expect(
                service.execute({
                    tenantId: 'tenant-a',
                    packageId: 'package-1',
                    routeId: 'route-1',
                    profile: 'MOTOR_VEHICLE',
                }),
            ).resolves.toMatchObject({
                kind: 'PENDING_ASSIGNMENT',
                reason:
                    field === 'geocoding'
                        ? 'GEOCODING_NOT_READY'
                        : 'NETWORK_ATTACHMENT_NOT_READY',
            });
        },
    );

    it('returns pending for a duplicate loaded by the repository', async () => {
        const { service } = createService({
            ...createContext(),
            hasDuplicateAssignment: true,
        });

        await expect(
            service.execute({
                tenantId: 'tenant-a',
                packageId: 'package-1',
                routeId: 'route-1',
                profile: 'MOTOR_VEHICLE',
            }),
        ).resolves.toMatchObject({
            kind: 'PENDING_ASSIGNMENT',
            reason: 'DUPLICATE_ASSIGNMENT',
            rejectedBy: 'DuplicateAssignmentValidationHandler',
        });
    });
});
