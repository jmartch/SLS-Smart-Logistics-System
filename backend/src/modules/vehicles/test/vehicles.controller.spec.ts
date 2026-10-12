import { BadRequestException, ConflictException } from '@nestjs/common';
import { RegisterVehicleService } from '../application/register-vehicle.service';
import { InvalidVehicleError } from '../domain/invalid-vehicle.error';
import { VehiclesController } from '../presentation/vehicles.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';

function createFixture() {
  const execute = jest.fn();
  const service = { execute } as unknown as RegisterVehicleService;

  return { execute, controller: new VehiclesController(service) };
}

describe('VehiclesController', () => {
  const body = { plate: 'abc123', maxWeightKg: 1200.5, maxVolumeM3: 8.25 };

  it('returns the created vehicle', async () => {
    const { controller, execute } = createFixture();
    const vehicle = {
      id: '20000000-0000-4000-8000-000000000001',
      tenantId: TENANT_ID,
      plate: 'ABC123',
      maxWeightKg: '1200.5',
      maxVolumeM3: '8.25',
      status: 'ACTIVE',
    };
    execute.mockResolvedValue({ ok: true, vehicle });

    const result = await controller.createVehicle(TENANT_ID, body);

    expect(result).toEqual(vehicle);
    expect(execute).toHaveBeenCalledWith(TENANT_ID, body);
  });

  it('maps domain validation errors to 400 VALIDATION_ERROR with field details', async () => {
    const { controller, execute } = createFixture();
    execute.mockRejectedValue(
      new InvalidVehicleError('maxWeightKg', 'NOT_POSITIVE'),
    );

    const error = await controller
      .createVehicle(TENANT_ID, body)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { maxWeightKg: expect.any(String) as unknown },
    });
  });

  it('maps a duplicate plate to 409 VEHICLE_PLATE_CONFLICT', async () => {
    const { controller, execute } = createFixture();
    execute.mockResolvedValue({
      ok: false,
      code: 'VEHICLE_PLATE_CONFLICT',
    });

    const error = await controller
      .createVehicle(TENANT_ID, body)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'VEHICLE_PLATE_CONFLICT',
      fields: { plate: expect.any(String) as unknown },
    });
  });

  it('does not hide unexpected errors', async () => {
    const { controller, execute } = createFixture();
    const failure = new Error('database down');
    execute.mockRejectedValue(failure);

    await expect(controller.createVehicle(TENANT_ID, body)).rejects.toBe(
      failure,
    );
  });

  it('treats a missing body as invalid input', async () => {
    const { controller, execute } = createFixture();
    execute.mockRejectedValue(new InvalidVehicleError('plate', 'REQUIRED'));

    await expect(
      controller.createVehicle(TENANT_ID, undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(execute).toHaveBeenCalledWith(TENANT_ID, {});
  });
});
