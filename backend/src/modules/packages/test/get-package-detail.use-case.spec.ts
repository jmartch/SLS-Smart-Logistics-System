import { GetPackageDetailUseCase } from '../application/get-package-detail.use-case';
import { PackageQueryPort } from '../application/ports/package-query.port';
import { PackageNotFoundError } from '../domain/package-errors';
import type { PackageGeocodingConfigPort } from '../application/ports/package-geocoding-config.port';

describe('GetPackageDetailUseCase', () => {
    it('returns a package owned by the requested tenant', async () => {
        const snapshot = {
            id: 'package-1',
            trackingCode: 'SLS-2026-10016',
            state: 'REGISTERED',
            priority: 'NORMAL',
            weightKg: '2.500',
            volumeM3: '0.010000',
            lengthCm: '20.00',
            widthCm: '20.00',
            heightCm: '25.00',
            deadline: null,
            address: 'Cra 53 # 82-10',
            zone: null,
            sector: null,
            shipmentType: 'EXPRESS',
            registeredAt: null,
            addressId: 'addr-1',
            municipalityCode: '08001',
            geocodingAttemptId: null,
            geocodingAttempt: null,
            latestDiagnosticAuditMetadata: null,
            candidates: [],
            history: [],
        };
        const findByTenantAndId = jest.fn().mockResolvedValue(snapshot);
        const query = { findByTenantAndId } as unknown as PackageQueryPort;
        const useCase = new GetPackageDetailUseCase(query);

        const result = await useCase.execute('tenant-a', 'package-1');
        expect(result).toMatchObject({
            id: 'package-1',
            trackingCode: 'SLS-2026-10016',
            geocoding: null,
            candidates: [],
        });
        expect(findByTenantAndId).toHaveBeenCalledWith('tenant-a', 'package-1');
    });

    it('evaluates geocoding diagnostic when attempt and target config exist', async () => {
        const snapshot = {
            id: 'package-2',
            trackingCode: 'SLS-2026-10017',
            state: 'REGISTERED',
            priority: 'NORMAL',
            weightKg: '2.500',
            volumeM3: '0.010000',
            lengthCm: '20.00',
            widthCm: '20.00',
            heightCm: '25.00',
            deadline: null,
            address: 'Cra 53 # 82-10',
            zone: null,
            sector: null,
            shipmentType: 'EXPRESS',
            registeredAt: null,
            addressId: 'addr-2',
            municipalityCode: '08001',
            geocodingAttemptId: 'attempt-1',
            geocodingAttempt: {
                id: 'attempt-1',
                datasetId: 'dataset-1',
                selectedCandidateId: 'cand-1',
                status: 'MATCHED',
                isDatasetReady: true,
                selectedCandidate: {
                    id: 'cand-1',
                    networkAttachments: [
                        {
                            id: 'att-1',
                            datasetId: 'dataset-1',
                            profile: 'MOTOR_VEHICLE',
                            status: 'AUTO_ACCEPTED',
                            accessDistanceMeters: 25,
                        },
                    ],
                },
            },
            latestDiagnosticAuditMetadata: null,
            candidates: [],
            history: [],
        };
        const findByTenantAndId = jest.fn().mockResolvedValue(snapshot);
        const query = { findByTenantAndId } as unknown as PackageQueryPort;
        const config: PackageGeocodingConfigPort = {
            findTargetForMunicipality: jest.fn().mockResolvedValue({
                datasetId: 'dataset-1',
                profile: 'MOTOR_VEHICLE',
                maxAcceptanceRadiusMeters: 150,
            }),
        };
        const useCase = new GetPackageDetailUseCase(query, config);

        const result = await useCase.execute('tenant-a', 'package-2');
        expect(result.geocoding).toEqual({
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
        });
    });

    it('returns the same neutral not-found result for absent or foreign packages', async () => {
        const query = {
            findByTenantAndId: jest.fn().mockResolvedValue(null),
        } as unknown as PackageQueryPort;
        const useCase = new GetPackageDetailUseCase(query);

        await expect(
            useCase.execute('tenant-a', 'foreign-package'),
        ).rejects.toBeInstanceOf(PackageNotFoundError);
    });
});
