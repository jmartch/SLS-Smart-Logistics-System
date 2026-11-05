import type { VehicleRepositoryPort } from '../application/ports/vehicle-repository.port';
import { RegisterVehicleService } from '../application/register-vehicle.service';
import { InvalidVehicleError } from '../domain/invalid-vehicle.error';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';

function createFixture() {
  const createByTenant = jest.fn();
  const repository: VehicleRepositoryPort = { createByTenant };

  return { createByTenant, service: new RegisterVehicleService(repository) };
}

describe('RegisterVehicleService', () => {
  it('normalizes input and persists it for the given tenant', async () => {
    const { createByTenant, service } = createFixture();
    const vehicle = {
      id: '20000000-0000-4000-8000-000000000001',
      tenantId: TENANT_ID,
      plate: 'ABC123',
      maxWeightKg: '1200.5',
      maxVolumeM3: '8.25',
      status: 'ACTIVE' as const,
    };
    createByTenant.mockResolvedValue({ ok: true, vehicle });

    const result = await service.execute(TENANT_ID, {
      plate: ' abc-123 ',
      maxWeightKg: '1200.500',
      maxVolumeM3: 8.25,
    });

    expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
      plate: 'ABC123',
      maxWeightKg: '1200.5',
      maxVolumeM3: '8.25',
    });
    expect(result).toEqual({ ok: true, vehicle });
  });

  it('returns the plate conflict reported by the repository', async () => {
    const { createByTenant, service } = createFixture();
    createByTenant.mockResolvedValue({
      ok: false,
      code: 'VEHICLE_PLATE_CONFLICT',
    });

    const result = await service.execute(TENANT_ID, {
      plate: 'ABC123',
      maxWeightKg: 100,
      maxVolumeM3: 1,
    });

    expect(result).toEqual({ ok: false, code: 'VEHICLE_PLATE_CONFLICT' });
  });

  it.each([
    [{ plate: '', maxWeightKg: 100, maxVolumeM3: 1 }],
    [{ plate: 'ABC123', maxWeightKg: 0, maxVolumeM3: 1 }],
    [{ plate: 'ABC123', maxWeightKg: 100, maxVolumeM3: -1 }],
  ])(
    'does not touch the repository when input is invalid (%j)',
    async (command) => {
      const { createByTenant, service } = createFixture();

      await expect(service.execute(TENANT_ID, command)).rejects.toBeInstanceOf(
        InvalidVehicleError,
      );
      expect(createByTenant).not.toHaveBeenCalled();
    },
  );
});
