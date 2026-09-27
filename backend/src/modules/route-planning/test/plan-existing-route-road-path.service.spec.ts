import { BuildRouteRoadPathService } from '../application/build-route-road-path.service';
import { PlanExistingRouteRoadPathService } from '../application/plan-existing-route-road-path.service';

describe('PlanExistingRouteRoadPathService', () => {
  function createFixture() {
    const resolveRouteWaypoints = jest.fn();
    const execute = jest.fn();
    const service = new PlanExistingRouteRoadPathService(
      { resolveRouteWaypoints },
      { execute } as unknown as BuildRouteRoadPathService,
    );

    return { resolveRouteWaypoints, execute, service };
  }

  const command = {
    tenantId: 'tenant-a',
    routeId: 'route-1',
    profile: 'MOTOR_VEHICLE' as const,
    costMetric: 'DURATION' as const,
  };

  it('derives trusted route waypoints before building the complete path', async () => {
    const { resolveRouteWaypoints, execute, service } = createFixture();
    resolveRouteWaypoints.mockResolvedValue({
      kind: 'RESOLVED',
      datasetId: 'dataset-1',
      depotNodeId: 'depot-node',
      orderedStopNodeIds: ['stop-node-1', 'stop-node-2'],
    });
    execute.mockResolvedValue({
      kind: 'PERSISTED',
      datasetChecksum: 'checksum-1',
      legCount: 3,
      totalDistanceM: 100,
      totalDurationS: 20,
    });

    await expect(service.execute(command)).resolves.toMatchObject({
      kind: 'PERSISTED',
      legCount: 3,
    });
    expect(resolveRouteWaypoints).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      routeId: 'route-1',
      profile: 'MOTOR_VEHICLE',
    });
    expect(execute).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      routeId: 'route-1',
      datasetId: 'dataset-1',
      profile: 'MOTOR_VEHICLE',
      costMetric: 'DURATION',
      depotNodeId: 'depot-node',
      orderedStopNodeIds: ['stop-node-1', 'stop-node-2'],
    });
  });

  it('does not calculate paths when a stop attachment is not ready', async () => {
    const { resolveRouteWaypoints, execute, service } = createFixture();
    resolveRouteWaypoints.mockResolvedValue({
      kind: 'STOP_ATTACHMENT_NOT_READY',
      routeStopId: 'stop-2',
    });

    await expect(service.execute(command)).resolves.toEqual({
      kind: 'STOP_ATTACHMENT_NOT_READY',
      routeStopId: 'stop-2',
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
