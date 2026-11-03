import { CourierNotFoundError } from '../domain/courier-errors';
import {
  courierCommitment,
  courierId,
  courierStatusCommand,
  validateCourierStatus,
  type CourierSnapshot,
} from '../domain/courier-management.policy';
import {
  CourierManagementPort,
  type CourierContext,
  type CourierListQuery,
} from './ports/courier-management.port';

function detail(snapshot: CourierSnapshot) {
  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    userId: snapshot.userId,
    email: snapshot.email,
    userStatus: snapshot.userStatus,
    status: snapshot.status,
    activeAssignmentCount: snapshot.activeAssignmentCount,
    ...courierCommitment(snapshot),
  };
}
export class ManageCourierService {
  constructor(private readonly couriers: CourierManagementPort) {}
  async list(tenantId: string, query: CourierListQuery) {
    const result = await this.couriers.list(tenantId, query);
    return {
      items: result.items.map(detail),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async eligibleUsers(tenantId: string, query: CourierListQuery) {
    return {
      ...(await this.couriers.eligibleUsers(tenantId, query)),
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async get(tenantId: string, id: unknown) {
    const snapshot = await this.couriers.find(tenantId, courierId(id));
    if (!snapshot) throw new CourierNotFoundError();
    return detail(snapshot);
  }
  changeStatus(context: CourierContext, id: unknown, body: unknown) {
    const normalizedId = courierId(id);
    const status = courierStatusCommand(body);
    return this.couriers.run(context, async (session) => {
      const snapshot = await session.loadForUpdate(normalizedId);
      if (!snapshot) throw new CourierNotFoundError();
      validateCourierStatus(snapshot, status);
      if (snapshot.status === status) return detail(snapshot);
      await session.saveStatus(normalizedId, status);
      const after = { ...snapshot, status };
      await session.audit(
        normalizedId,
        'COURIER_STATUS_UPDATED',
        snapshot,
        after,
      );
      return detail(after);
    });
  }
}
