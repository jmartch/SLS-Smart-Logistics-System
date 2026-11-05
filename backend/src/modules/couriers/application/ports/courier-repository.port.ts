import type { CourierStatus } from '../../domain/courier-management.policy';

export interface CourierEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly status: CourierStatus;
}

export type CreateCourierResult =
  | {
      readonly ok: true;
      readonly courier: CourierEntry;
    }
  | {
      readonly ok: false;
      readonly code: 'COURIER_USER_ALREADY_LINKED';
    };

export type CourierRepositoryPort = Pick<
  import('./courier-management.port').CourierManagementPort,
  'run'
>;
