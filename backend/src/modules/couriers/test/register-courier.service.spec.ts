import { RegisterCourierService } from '../application/register-courier.service';
import type { CourierSession } from '../application/ports/courier-management.port';
import { CourierAlreadyLinkedError } from '../domain/courier-errors';
import { InvalidCourierError } from '../domain/invalid-courier.error';

const context = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  actorUserId: '20000000-0000-4000-8000-000000000001',
  correlationId: '30000000-0000-4000-8000-000000000001',
};
const userId = '40000000-0000-4000-8000-0000000000ab';
function fixture() {
  const courier = {
    id: 'courier',
    tenantId: context.tenantId,
    userId,
    status: 'ACTIVE' as const,
  };
  const session: jest.Mocked<CourierSession> = {
    findUserForUpdate: jest.fn().mockResolvedValue({
      id: userId,
      email: 'courier@example.test',
      status: 'ACTIVE',
    }),
    create: jest.fn().mockResolvedValue(courier),
    audit: jest.fn(),
    loadForUpdate: jest.fn(),
    saveStatus: jest.fn(),
  };
  const run = jest.fn(
    async (
      _context: unknown,
      operation: (value: CourierSession) => Promise<unknown>,
    ) => operation(session),
  );
  const service = new RegisterCourierService({ run } as never);
  return { courier, session, run, service };
}
describe('RegisterCourierService', () => {
  it('locks an active tenant user, creates once and audits within the transaction', async () => {
    const { courier, session, service, run } = fixture();
    await expect(
      service.execute(context, { userId: ` ${userId.toUpperCase()} ` }),
    ).resolves.toEqual({ ok: true, courier });
    expect(run).toHaveBeenCalledWith(context, expect.any(Function));
    expect(session.findUserForUpdate).toHaveBeenCalledWith(userId);
    expect(session.create).toHaveBeenCalledWith(userId);
    expect(session.audit).toHaveBeenCalledWith(
      courier.id,
      'COURIER_REGISTERED',
      null,
      courier,
    );
  });
  it.each([
    null,
    { id: userId, status: 'INACTIVE' },
    { id: userId, status: 'SUSPENDED' },
  ])('rejects an absent or ineligible user: %j', async (user) => {
    const { session, service } = fixture();
    session.findUserForUpdate.mockResolvedValue(user as never);
    await expect(service.execute(context, { userId })).resolves.toEqual({
      ok: false,
      code: user ? 'COURIER_USER_NOT_ELIGIBLE' : 'COURIER_USER_NOT_FOUND',
    });
    expect(session.create).not.toHaveBeenCalled();
    expect(session.audit).not.toHaveBeenCalled();
  });
  it('reports a duplicate without hiding unexpected database errors', async () => {
    const { session, service } = fixture();
    session.create.mockRejectedValueOnce(new CourierAlreadyLinkedError());
    await expect(service.execute(context, { userId })).resolves.toEqual({
      ok: false,
      code: 'COURIER_USER_ALREADY_LINKED',
    });
    const error = new Error('Database unavailable');
    session.create.mockRejectedValueOnce(error);
    await expect(service.execute(context, { userId })).rejects.toBe(error);
  });
  it('propagates audit failure so the transaction can roll back', async () => {
    const { session, service } = fixture();
    const error = new Error('Audit write failed');
    session.audit.mockRejectedValue(error);
    await expect(service.execute(context, { userId })).rejects.toBe(error);
  });
  it('rejects invalid input before persistence', async () => {
    const { run, service } = fixture();
    await expect(
      service.execute(context, { userId: 'invalid' }),
    ).rejects.toBeInstanceOf(InvalidCourierError);
    expect(run).not.toHaveBeenCalled();
  });
});
