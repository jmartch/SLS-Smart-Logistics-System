import { normalizeCourierUserId } from '../domain/courier-user-id';
import { isUserEligibleForCourier } from '../domain/courier-user-eligibility.policy';
import type {
  CourierRepositoryPort,
  CreateCourierResult,
} from './ports/courier-repository.port';

export interface RegisterCourierCommand {
  readonly userId?: unknown;
}

export type RegisterCourierResult =
  | CreateCourierResult
  | {
      readonly ok: false;
      readonly code: 'COURIER_USER_NOT_FOUND' | 'COURIER_USER_NOT_ELIGIBLE';
    };

export class RegisterCourierService {
  constructor(private readonly couriers: CourierRepositoryPort) {}

  async execute(
    tenantId: string,
    command: RegisterCourierCommand,
  ): Promise<RegisterCourierResult> {
    const userId = normalizeCourierUserId(command.userId);

    // La lectura está acotada al tenant (RLS): un usuario de otra empresa
    // es indistinguible de uno inexistente.
    const user = await this.couriers.findUserByTenant(tenantId, userId);

    if (!user) {
      return { ok: false, code: 'COURIER_USER_NOT_FOUND' };
    }

    if (!isUserEligibleForCourier(user.status)) {
      return { ok: false, code: 'COURIER_USER_NOT_ELIGIBLE' };
    }

    return this.couriers.createByTenant(tenantId, { userId });
  }
}
