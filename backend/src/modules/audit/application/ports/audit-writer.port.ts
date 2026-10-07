export interface AuditLogEntry {
  readonly tenantId: string;
  readonly actorUserId?: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly correlationId?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt?: Date;
}

export interface AuditWriterPort {
  recordAudit(entry: AuditLogEntry): Promise<void>;
}
