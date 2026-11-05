import { normalizeCourierUserId } from '../domain/courier-user-id';
import { isUserEligibleForCourier } from '../domain/courier-user-eligibility.policy';
import { CourierAlreadyLinkedError } from '../domain/courier-errors';
import type { CourierContext } from './ports/courier-management.port';
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
    context: CourierContext,
    command: RegisterCourierCommand,
  ): Promise<RegisterCourierResult> {
    const userId = normalizeCourierUserId(command.userId);

    try {
      return await this.couriers.run(
        context,
        async (session): Promise<RegisterCourierResult> => {
          const user = await session.findUserForUpdate(userId);
          if (!user) return { ok: false, code: 'COURIER_USER_NOT_FOUND' };
          if (!isUserEligibleForCourier(user.status))
            return { ok: false, code: 'COURIER_USER_NOT_ELIGIBLE' };
          const courier = await session.create(userId);
          await session.audit(courier.id, 'COURIER_REGISTERED', null, courier);
          return { ok: true, courier };
        },
      );
    } catch (error) {
      if (error instanceof CourierAlreadyLinkedError)
        return { ok: false, code: 'COURIER_USER_ALREADY_LINKED' };
      throw error;
    }
  }
}
