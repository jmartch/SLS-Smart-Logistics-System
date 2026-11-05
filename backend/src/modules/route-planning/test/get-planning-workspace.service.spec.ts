import { GetPlanningWorkspaceService } from '../application/get-planning-workspace.service';
import {
    PlanningWorkspaceQueryPort,
    type PlanningWorkspaceQuery,
    type PlanningWorkspaceSnapshot,
} from '../application/ports/planning-workspace-query.port';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const ZONE_A = '20000000-0000-4000-8000-000000000001';

function createEmptySnapshot(tenantId: string): PlanningWorkspaceSnapshot {
    return {
        tenantId,
        window: null,
        zones: [],
        depots: [],
        datasets: [],
        vehicles: [],
        couriers: [],
        candidatePackages: [],
        editableRoutes: [],
    };
}

describe('GetPlanningWorkspaceService', () => {
    it('queries tenant-scoped workspace resources and normalizes the operating window', async () => {
        const getWorkspace = jest
            .fn<Promise<PlanningWorkspaceSnapshot>, [PlanningWorkspaceQuery]>()
            .mockResolvedValue({
                ...createEmptySnapshot(TENANT_A),
                window: {
                    startAt: '2026-10-12T08:00:00.000Z',
                    endAt: '2026-10-12T13:00:00.000Z',
                },
                editableRoutes: [
                    {
                        id: '70000000-0000-4000-8000-000000000001',
                        state: 'PLANNED',
                        vehicleId: '50000000-0000-4000-8000-000000000001',
                        vehiclePlate: 'BAQ-101',
                        courierId: '60000000-0000-4000-8000-000000000001',
                        courierEmail: 'courier@demo.co',
                        depotId: '30000000-0000-4000-8000-000000000001',
                        plannedStartAt: '2026-10-12T08:00:00.000Z',
                        plannedEndAt: '2026-10-12T13:00:00.000Z',
                        stopCount: 3,
                        assignedPackageCount: 3,
                        assignedWeightKg: '15.000',
                        assignedVolumeM3: '0.090000',
                        remainingWeightKg: '85.000',
                        remainingVolumeM3: '0.910000',
                    },
                ],
            });

        const port: PlanningWorkspaceQueryPort = { getWorkspace };
        const service = new GetPlanningWorkspaceService(port);

        const result = await service.execute({
            tenantId: TENANT_A,
            zoneId: ZONE_A,
            window: {
                startAt: '2026-10-12T08:00:00Z',
                endAt: '2026-10-12T13:00:00Z',
            },
        });

        expect(getWorkspace).toHaveBeenCalledWith({
            tenantId: TENANT_A,
            zoneId: ZONE_A,
            window: {
                startAt: '2026-10-12T08:00:00.000Z',
                endAt: '2026-10-12T13:00:00.000Z',
            },
        });
        expect(result.tenantId).toBe(TENANT_A);
        expect(result.editableRoutes).toHaveLength(1);
        expect(result.editableRoutes[0]?.state).toBe('PLANNED');
    });

    it('rejects invalid tenantId with TENANT_MISMATCH', async () => {
        const port: PlanningWorkspaceQueryPort = {
            getWorkspace: jest.fn(),
        };
        const service = new GetPlanningWorkspaceService(port);

        await expect(
            service.execute({ tenantId: 'not-a-uuid' }),
        ).rejects.toThrow('TENANT_MISMATCH');
    });

    it('rejects invalid zoneId when not a UUID', async () => {
        const port: PlanningWorkspaceQueryPort = {
            getWorkspace: jest.fn(),
        };
        const service = new GetPlanningWorkspaceService(port);

        await expect(
            service.execute({ tenantId: TENANT_A, zoneId: 'invalid-zone' }),
        ).rejects.toThrow('Invalid zoneId');
    });

    it('rejects operating window when startAt is after or equal to endAt', async () => {
        const port: PlanningWorkspaceQueryPort = {
            getWorkspace: jest.fn(),
        };
        const service = new GetPlanningWorkspaceService(port);

        await expect(
            service.execute({
                tenantId: TENANT_A,
                window: {
                    startAt: '2026-10-12T14:00:00.000Z',
                    endAt: '2026-10-12T08:00:00.000Z',
                },
            }),
        ).rejects.toThrow('Invalid operating window');
    });
});
