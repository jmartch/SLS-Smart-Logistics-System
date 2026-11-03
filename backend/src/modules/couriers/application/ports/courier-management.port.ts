import type { DirectoryUser } from '../../../users/application/ports/user-directory.port';
import type {
  CourierSnapshot,
  CourierStatus,
} from '../../domain/courier-management.policy';
import type { CourierEntry } from './courier-repository.port';

export interface CourierContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly correlationId: string;
}
export interface CourierListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly status?: CourierStatus;
}
export interface CourierSession {
  loadForUpdate(this: void, id: string): Promise<CourierSnapshot | null>;
  findUserForUpdate(this: void, id: string): Promise<DirectoryUser | null>;
  create(this: void, userId: string): Promise<CourierEntry>;
  saveStatus(this: void, id: string, status: CourierStatus): Promise<void>;
  audit(
    this: void,
    id: string,
    action: 'COURIER_REGISTERED' | 'COURIER_STATUS_UPDATED',
    before: { userId: string; status: CourierStatus } | null,
    after: { userId: string; status: CourierStatus },
  ): Promise<void>;
}
export abstract class CourierManagementPort {
  abstract list(
    tenantId: string,
    query: CourierListQuery,
  ): Promise<{ items: CourierSnapshot[]; total: number }>;
  abstract eligibleUsers(
    tenantId: string,
    query: CourierListQuery,
  ): Promise<{ items: DirectoryUser[]; total: number }>;
  abstract find(tenantId: string, id: string): Promise<CourierSnapshot | null>;
  abstract run<T>(
    context: CourierContext,
    operation: (session: CourierSession) => Promise<T>,
  ): Promise<T>;
}
