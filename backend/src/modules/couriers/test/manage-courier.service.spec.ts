import { ManageCourierService } from '../application/manage-courier.service';
import type {
  CourierManagementPort,
  CourierSession,
} from '../application/ports/courier-management.port';
import {
  courierCommitment,
  type CourierSnapshot,
} from '../domain/courier-management.policy';
import {
  CourierCommittedError,
  CourierNotFoundError,
  CourierUserNotEligibleError,
  CourierValidationError,
} from '../domain/courier-errors';

const id = '40000000-0000-4000-8000-000000000001';
const context = {
  tenantId: 'tenant-a',
  actorUserId: 'actor',
  correlationId: 'correlation',
};
const snapshot: CourierSnapshot = {
  id,
  tenantId: 'tenant-a',
  userId: 'user',
  email: 'courier@example.test',
  userStatus: 'ACTIVE',
  status: 'ACTIVE',
  activeAssignmentCount: 0,
  routes: [],
};
function fixture(overrides: Partial<CourierSnapshot> = {}) {
  const session: jest.Mocked<CourierSession> = {
    loadForUpdate: jest.fn().mockResolvedValue({ ...snapshot, ...overrides }),
    saveStatus: jest.fn(),
    audit: jest.fn(),
    create: jest.fn(),
    findUserForUpdate: jest.fn(),
  };
  const port = {
    run: async (
      _context: unknown,
      operation: (value: CourierSession) => Promise<unknown>,
    ) => operation(session),
    find: jest.fn(),
    list: jest.fn(),
    eligibleUsers: jest.fn(),
  };
  return {
    session,
    port,
    service: new ManageCourierService(port as CourierManagementPort),
  };
}
describe('ManageCourierService', () => {
  it('inactivates a free courier and audits old/new state', async () => {
    const { service, session } = fixture();
    await expect(
      service.changeStatus(context, id, { status: 'INACTIVE' }),
    ).resolves.toMatchObject({ status: 'INACTIVE', isCommitted: false });
    expect(session.saveStatus).toHaveBeenCalledWith(id, 'INACTIVE');
    expect(session.audit).toHaveBeenCalledWith(
      id,
      'COURIER_STATUS_UPDATED',
      snapshot,
      { ...snapshot, status: 'INACTIVE' },
    );
  });
  it.each([
    'DRAFT',
    'PLANNING',
    'PLANNED',
    'READY',
    'IN_PROGRESS',
    'INTERRUPTED',
  ])('prevents inactivation for a %s route', async (state) => {
    const { service, session } = fixture({ routes: [{ id: 'route', state }] });
    await expect(
      service.changeStatus(context, id, { status: 'INACTIVE' }),
    ).rejects.toBeInstanceOf(CourierCommittedError);
    expect(session.saveStatus).not.toHaveBeenCalled();
    expect(session.audit).not.toHaveBeenCalled();
  });
  it.each(['COMPLETED', 'CANCELLED', 'PLANNING_FAILED'])(
    'allows inactivation after a %s route',
    async (state) => {
      const { service } = fixture({ routes: [{ id: 'route', state }] });
      await expect(
        service.changeStatus(context, id, { status: 'INACTIVE' }),
      ).resolves.toMatchObject({ status: 'INACTIVE' });
    },
  );
  it('keeps active assignments committed even on a closed route', () => {
    expect(
      courierCommitment({
        ...snapshot,
        activeAssignmentCount: 1,
        routes: [{ id: 'route', state: 'COMPLETED' }],
      }).isCommitted,
    ).toBe(true);
  });
  it.each(['INACTIVE', 'SUSPENDED'] as const)(
    'rejects activation with a %s user account',
    async (userStatus) => {
      const { service, session } = fixture({ status: 'INACTIVE', userStatus });
      await expect(
        service.changeStatus(context, id, { status: 'ACTIVE' }),
      ).rejects.toBeInstanceOf(CourierUserNotEligibleError);
      expect(session.saveStatus).not.toHaveBeenCalled();
    },
  );
  it('treats an unchanged status as a no-op without duplicate audit', async () => {
    const { service, session } = fixture();
    await service.changeStatus(context, id, { status: 'ACTIVE' });
    expect(session.saveStatus).not.toHaveBeenCalled();
    expect(session.audit).not.toHaveBeenCalled();
  });
  it('returns the same neutral not-found for missing and hidden resources', async () => {
    const { service, session, port } = fixture();
    session.loadForUpdate.mockResolvedValue(null);
    port.find.mockResolvedValue(null);
    await expect(
      service.changeStatus(context, id, { status: 'INACTIVE' }),
    ).rejects.toBeInstanceOf(CourierNotFoundError);
    await expect(service.get('tenant-a', id)).rejects.toBeInstanceOf(
      CourierNotFoundError,
    );
  });
  it.each([
    {},
    null,
    [],
    { status: 'MAINTENANCE' },
    { status: 'ACTIVE', userId: 'other' },
  ])('rejects invalid status bodies: %j', (body) => {
    const { service, session } = fixture();
    expect(() => service.changeStatus(context, id, body)).toThrow(
      CourierValidationError,
    );
    expect(session.loadForUpdate).not.toHaveBeenCalled();
  });
  it('rejects malformed courier ids before persistence', async () => {
    const { service, port } = fixture();
    await expect(service.get('tenant-a', 'invalid')).rejects.toBeInstanceOf(
      CourierValidationError,
    );
    expect(port.find).not.toHaveBeenCalled();
  });
  it('propagates audit failure without reporting success', async () => {
    const { service, session } = fixture();
    session.audit.mockRejectedValue(new Error('Audit failed'));
    await expect(
      service.changeStatus(context, id, { status: 'INACTIVE' }),
    ).rejects.toThrow('Audit failed');
  });
});
