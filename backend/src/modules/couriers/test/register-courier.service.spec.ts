import type { CourierRepositoryPort } from '../application/ports/courier-repository.port';
import { RegisterCourierService } from '../application/register-courier.service';
import { InvalidCourierError } from '../domain/invalid-courier.error';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '30000000-0000-4000-8000-000000000001';

function createFixture() {
  const findUserByTenant = jest.fn();
  const createByTenant = jest.fn();
  const repository: CourierRepositoryPort = {
    findUserByTenant,
    createByTenant,
  };

  return {
    findUserByTenant,
    createByTenant,
    service: new RegisterCourierService(repository),
  };
}

describe('RegisterCourierService', () => {
  it('links an active user of the same tenant as courier', async () => {
    const { findUserByTenant, createByTenant, service } = createFixture();
    const courier = {
      id: '40000000-0000-4000-8000-000000000001',
      tenantId: TENANT_ID,
      userId: USER_ID,
      status: 'ACTIVE' as const,
    };
    findUserByTenant.mockResolvedValue({
      id: USER_ID,
      status: 'ACTIVE',
    });
    createByTenant.mockResolvedValue({ ok: true, courier });

    const result = await service.execute(TENANT_ID, {
      userId: USER_ID.toUpperCase(),
    });

    expect(findUserByTenant).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
      userId: USER_ID,
    });
    expect(result).toEqual({ ok: true, courier });
  });

  it('reports COURIER_USER_NOT_FOUND when the user is not visible in the tenant', async () => {
    const { findUserByTenant, createByTenant, service } = createFixture();
    findUserByTenant.mockResolvedValue(null);

    const result = await service.execute(TENANT_ID, { userId: USER_ID });

    expect(result).toEqual({ ok: false, code: 'COURIER_USER_NOT_FOUND' });
    expect(createByTenant).not.toHaveBeenCalled();
  });

  it.each(['INACTIVE', 'SUSPENDED'] as const)(
    'rejects a %s user as not eligible',
    async (status) => {
      const { findUserByTenant, createByTenant, service } = createFixture();
      findUserByTenant.mockResolvedValue({ id: USER_ID, status });

      const result = await service.execute(TENANT_ID, { userId: USER_ID });

      expect(result).toEqual({ ok: false, code: 'COURIER_USER_NOT_ELIGIBLE' });
      expect(createByTenant).not.toHaveBeenCalled();
    },
  );

  it('returns the already-linked conflict reported by the repository', async () => {
    const { findUserByTenant, createByTenant, service } = createFixture();
    findUserByTenant.mockResolvedValue({
      id: USER_ID,
      status: 'ACTIVE',
    });
    createByTenant.mockResolvedValue({
      ok: false,
      code: 'COURIER_USER_ALREADY_LINKED',
    });

    const result = await service.execute(TENANT_ID, { userId: USER_ID });

    expect(result).toEqual({ ok: false, code: 'COURIER_USER_ALREADY_LINKED' });
  });

  it('does not touch the repository when the input is invalid', async () => {
    const { findUserByTenant, createByTenant, service } = createFixture();

    await expect(
      service.execute(TENANT_ID, { userId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(InvalidCourierError);
    expect(findUserByTenant).not.toHaveBeenCalled();
    expect(createByTenant).not.toHaveBeenCalled();
  });
});
