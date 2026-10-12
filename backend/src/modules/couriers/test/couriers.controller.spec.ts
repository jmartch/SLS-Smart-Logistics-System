import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { REQUIRED_PERMISSION_KEY } from '../../auth/presentation/require-permission.decorator';
import type { RequestContext } from '../../../shared/presentation/request-context.decorator';
import { RegisterCourierService } from '../application/register-courier.service';
import { InvalidCourierError } from '../domain/invalid-courier.error';
import {
  CouriersController,
  MANAGE_COURIERS_PERMISSION,
} from '../presentation/couriers.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_USER_ID = '20000000-0000-4000-8000-000000000001';
const USER_ID = '30000000-0000-4000-8000-000000000001';
const CORRELATION_ID = '40000000-0000-4000-8000-000000000001';

const context: RequestContext = {
  tenantId: TENANT_ID,
  actorUserId: ACTOR_USER_ID,
  correlationId: CORRELATION_ID,
};

function createFixture() {
  const execute = jest.fn();
  const service = { execute } as unknown as RegisterCourierService;

  return { execute, controller: new CouriersController(service) };
}

describe('CouriersController', () => {
  const body = { userId: USER_ID };

  it('protects POST /couriers with AuthGuard, PermissionsGuard and MANAGE_TENANT', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      CouriersController,
    ) as unknown[];
    const permission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      CouriersController.prototype.createCourier,
    ) as unknown;

    expect(guards).toEqual([AuthGuard, PermissionsGuard]);
    expect(permission).toBe(MANAGE_COURIERS_PERMISSION);
  });

  it('returns the created courier', async () => {
    const { controller, execute } = createFixture();
    const courier = {
      id: '40000000-0000-4000-8000-000000000001',
      tenantId: TENANT_ID,
      userId: USER_ID,
      status: 'ACTIVE',
    };
    execute.mockResolvedValue({ ok: true, courier });

    await expect(controller.createCourier(context, body)).resolves.toEqual(
      courier,
    );
    expect(execute).toHaveBeenCalledWith(TENANT_ID, body);
  });

  it('maps invalid input to 400 VALIDATION_ERROR with field details', async () => {
    const { controller, execute } = createFixture();
    execute.mockRejectedValue(
      new InvalidCourierError('userId', 'INVALID_FORMAT'),
    );

    const error = await controller
      .createCourier(context, body)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { userId: expect.any(String) as unknown },
    });
  });

  it('maps an unknown or foreign user to 404 COURIER_USER_NOT_FOUND', async () => {
    const { controller, execute } = createFixture();
    execute.mockResolvedValue({
      ok: false,
      code: 'COURIER_USER_NOT_FOUND',
    });

    const error = await controller
      .createCourier(context, body)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'COURIER_USER_NOT_FOUND',
    });
  });

  it.each([
    'COURIER_USER_NOT_ELIGIBLE',
    'COURIER_USER_ALREADY_LINKED',
  ] as const)('maps %s to 409', async (code) => {
    const { controller, execute } = createFixture();
    execute.mockResolvedValue({ ok: false, code });

    const error = await controller
      .createCourier(context, body)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ code });
  });

  it('does not hide unexpected errors', async () => {
    const { controller, execute } = createFixture();
    const failure = new Error('database down');
    execute.mockRejectedValue(failure);

    await expect(controller.createCourier(context, body)).rejects.toBe(failure);
  });

  it('treats a missing body as invalid input', async () => {
    const { controller, execute } = createFixture();
    execute.mockRejectedValue(new InvalidCourierError('userId', 'REQUIRED'));

    await expect(
      controller.createCourier(context, undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(execute).toHaveBeenCalledWith(TENANT_ID, {});
  });
});
