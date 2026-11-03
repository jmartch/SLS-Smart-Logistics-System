import { ManageVehicleService } from '../application/manage-vehicle.service';
import {
  VehicleManagementPort,
  type VehicleManagementSession,
} from '../application/ports/vehicle-management.port';
import {
  VehicleCapacityConflictError,
  VehicleCommittedError,
  VehicleNotFoundError,
  VehicleValidationError,
} from '../domain/vehicle-errors';
import type { VehicleSnapshot } from '../domain/vehicle-management.policy';

const tenantId = '10000000-0000-4000-8000-000000000001';
const vehicleId = '20000000-0000-4000-8000-000000000001';
const context = {
  tenantId,
  actorUserId: '30000000-0000-4000-8000-000000000001',
  correlationId: '40000000-0000-4000-8000-000000000001',
};
const snapshot: VehicleSnapshot = {
  id: vehicleId,
  tenantId,
  plate: 'ABC123',
  status: 'ACTIVE',
  maxWeightKg: '10.001',
  maxVolumeM3: '1.000001',
  assignedWeightKg: '0.002',
  assignedVolumeM3: '0.000002',
  routeStates: ['PLANNED'],
  activeAssignmentCount: 1,
};
function fixture(overrides: Partial<VehicleSnapshot> = {}) {
  const session = {
    loadForUpdate: jest.fn().mockResolvedValue({ ...snapshot, ...overrides }),
    save: jest.fn().mockResolvedValue(undefined),
    audit: jest.fn().mockResolvedValue(undefined),
  };
  const port = {
    findByTenantAndId: jest
      .fn()
      .mockResolvedValue({ ...snapshot, ...overrides }),
    run: jest.fn(
      async (
        _context,
        work: (s: VehicleManagementSession) => Promise<unknown>,
      ) => work(session),
    ),
  };
  return {
    session,
    port,
    service: new ManageVehicleService(port as VehicleManagementPort),
  };
}
describe('ManageVehicleService', () => {
  it('normalizes a partial update and audits within the transactional callback', async () => {
    const { service, session, port } = fixture();
    await expect(
      service.update(context, vehicleId, {
        plate: ' abc-321 ',
        maxWeightKg: '12.001',
      }),
    ).resolves.toMatchObject({
      plate: 'ABC321',
      remainingWeightKg: '11.999',
      isCommitted: true,
    });
    expect(port.run).toHaveBeenCalledWith(context, expect.any(Function));
    expect(session.save).toHaveBeenCalledWith(vehicleId, {
      plate: 'ABC321',
      maxWeightKg: '12.001',
    });
    expect(session.audit).toHaveBeenCalledWith(
      vehicleId,
      'VEHICLE_UPDATED',
      snapshot,
      expect.objectContaining({ plate: 'ABC321' }),
    );
  });
  it.each([{ maxWeightKg: '0.001' }, { maxVolumeM3: '0.000001' }])(
    'rejects capacity below assigned load: %j',
    async (changes) => {
      const { service, session } = fixture();
      await expect(
        service.update(context, vehicleId, changes),
      ).rejects.toBeInstanceOf(VehicleCapacityConflictError);
      expect(session.save).not.toHaveBeenCalled();
      expect(session.audit).not.toHaveBeenCalled();
    },
  );
  it('allows capacity equal to active load without rounding', async () => {
    const { service } = fixture();
    await expect(
      service.update(context, vehicleId, {
        maxWeightKg: '0.002',
        maxVolumeM3: '0.000002',
      }),
    ).resolves.toMatchObject({
      remainingWeightKg: '0.000',
      remainingVolumeM3: '0.000000',
    });
  });
  it.each([
    'DRAFT',
    'PLANNING',
    'PLANNED',
    'READY',
    'IN_PROGRESS',
    'INTERRUPTED',
  ])('blocks inactivation for %s even without cargo', async (state) => {
    const { service } = fixture({
      routeStates: [state],
      activeAssignmentCount: 0,
    });
    await expect(
      service.changeStatus(context, vehicleId, { status: 'INACTIVE' }),
    ).rejects.toBeInstanceOf(VehicleCommittedError);
  });
  it('blocks maintenance for active cargo even if routes are closed', async () => {
    const { service } = fixture({ routeStates: ['COMPLETED'] });
    await expect(
      service.changeStatus(context, vehicleId, { status: 'MAINTENANCE' }),
    ).rejects.toBeInstanceOf(VehicleCommittedError);
  });
  it.each(['INACTIVE', 'MAINTENANCE', 'ACTIVE'])(
    'allows %s for an uncommitted resource and audits status',
    async (status) => {
      const { service, session } = fixture({
        routeStates: ['COMPLETED', 'CANCELLED', 'PLANNING_FAILED'],
        activeAssignmentCount: 0,
      });
      await expect(
        service.changeStatus(context, vehicleId, { status }),
      ).resolves.toMatchObject({ status, isCommitted: false });
      expect(session.audit).toHaveBeenCalledWith(
        vehicleId,
        'VEHICLE_STATUS_UPDATED',
        expect.any(Object),
        expect.objectContaining({ status }),
      );
    },
  );
  it('uses the trusted tenant for detail and computes exact capacity', async () => {
    const { service, port } = fixture();
    await expect(service.detail(tenantId, vehicleId)).resolves.toMatchObject({
      remainingWeightKg: '9.999',
      remainingVolumeM3: '0.999999',
    });
    expect(port.findByTenantAndId).toHaveBeenCalledWith(tenantId, vehicleId);
  });
  it('returns the same neutral error for unavailable vehicles', async () => {
    const { service, session, port } = fixture();
    port.findByTenantAndId.mockResolvedValue(null);
    session.loadForUpdate.mockResolvedValue(null);
    await expect(service.detail(tenantId, vehicleId)).rejects.toBeInstanceOf(
      VehicleNotFoundError,
    );
    await expect(
      service.update(context, vehicleId, { plate: 'ABC321' }),
    ).rejects.toBeInstanceOf(VehicleNotFoundError);
    await expect(service.detail(tenantId, 'invalid')).rejects.toBeInstanceOf(
      VehicleNotFoundError,
    );
    expect(session.save).not.toHaveBeenCalled();
  });
  it.each([{}, { tenantId: 'spoof' }, { status: 'INACTIVE' }, null])(
    'rejects invalid edits: %j',
    (body) => {
      const { service, port } = fixture();
      expect(() => service.update(context, vehicleId, body)).toThrow(
        VehicleValidationError,
      );
      expect(port.run).not.toHaveBeenCalled();
    },
  );
  it('rejects unknown status with a field code', () => {
    const { service } = fixture();
    expect(() =>
      service.changeStatus(context, vehicleId, { status: 'BROKEN' }),
    ).toThrow(VehicleValidationError);
  });
});
