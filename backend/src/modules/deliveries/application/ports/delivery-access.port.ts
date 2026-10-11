export interface DeliveryAccessPort {
  getCourierIdForUser(
    tenantId: string,
    actorUserId: string,
  ): Promise<string | null>;

  canAttendStop(
    tenantId: string,
    actorUserId: string,
    routeCourierId: string,
  ): Promise<boolean>;

  canRecordAttempt(
    tenantId: string,
    actorUserId: string,
    routeCourierId: string,
  ): Promise<boolean>;

  canReschedule(tenantId: string, actorUserId: string): Promise<boolean>;

  canRequestReturn(tenantId: string, actorUserId: string): Promise<boolean>;

  canReceiveAtDepot(tenantId: string, actorUserId: string): Promise<boolean>;

  canReportIncident(
    tenantId: string,
    actorUserId: string,
    routeCourierId?: string,
  ): Promise<boolean>;

  canViewDeliveries(
    tenantId: string,
    actorUserId: string,
    routeCourierId?: string,
  ): Promise<boolean>;
}
