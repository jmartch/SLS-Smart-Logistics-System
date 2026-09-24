import { Pool } from 'pg';

export interface ReservationRequest {
  tenantId: string;
  packageId: string;
  routeId: string;
  routeStopId?: string;
  responsibleUserId?: string;
}

export type ReservationResult =
  | { kind: 'ASSIGNED'; assignmentId: string }
  | { kind: 'PENDING_ASSIGNMENT'; reason: 'NO_CAPACITY' }
  | { kind: 'NOT_FOUND' };

/** Persistence primitive; callers must supply tenantId from trusted identity.
 * Logistics state transitions/events belong to the future assignment use case.
 */
export class PostgresAssignmentReservation {
  constructor(private readonly pool: Pool) {}

  async reserve(request: ReservationRequest): Promise<ReservationResult> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [
          request.tenantId,
        ]);
        const route = await client.query<{
          vehicleId: string;
          courierId: string;
        }>(
          `SELECT "vehicleId", "courierId" FROM "Route"
           WHERE "tenantId"=$1 AND id=$2 FOR UPDATE`,
          [request.tenantId, request.routeId],
        );
        const pkg = await client.query(
          'SELECT id FROM "Package" WHERE "tenantId"=$1 AND id=$2 FOR UPDATE',
          [request.tenantId, request.packageId],
        );
        if (!route.rowCount || !pkg.rowCount) {
          await client.query('ROLLBACK');
          return { kind: 'NOT_FOUND' };
        }
        const { vehicleId, courierId } = route.rows[0];
        // Lock both previous and target vehicles in a stable order on reassignment.
        await client.query(
          `SELECT id FROM "Vehicle" WHERE "tenantId"=$1 AND
           (id=$2 OR id IN (SELECT "vehicleId" FROM "Assignment"
             WHERE "tenantId"=$1 AND "packageId"=$3 AND status='ACTIVE'))
           ORDER BY id FOR UPDATE`,
          [request.tenantId, vehicleId, request.packageId],
        );
        const capacity = await client.query<{ fits: boolean }>(
          `SELECT
            COALESCE(SUM(p."weightKg"),0) + incoming."weightKg" <= v."maxWeightKg"
            AND COALESCE(SUM(p."volumeM3"),0) + incoming."volumeM3" <= v."maxVolumeM3" AS fits
           FROM "Vehicle" v
           JOIN "Package" incoming ON incoming."tenantId"=v."tenantId" AND incoming.id=$3
           LEFT JOIN "Assignment" a ON a."tenantId"=v."tenantId" AND a."vehicleId"=v.id
             AND a.status='ACTIVE' AND a."packageId"<>$3
           LEFT JOIN "Package" p ON p."tenantId"=a."tenantId" AND p.id=a."packageId"
           WHERE v."tenantId"=$1 AND v.id=$2
           GROUP BY v.id, incoming.id`,
          [request.tenantId, vehicleId, request.packageId],
        );
        if (!capacity.rows[0]?.fits) {
          await client.query('ROLLBACK');
          return { kind: 'PENDING_ASSIGNMENT', reason: 'NO_CAPACITY' };
        }
        const previous = await client.query(
          `UPDATE "Assignment" SET status='ENDED', "endedAt"=CURRENT_TIMESTAMP
           WHERE "tenantId"=$1 AND "packageId"=$2 AND status='ACTIVE' RETURNING id`,
          [request.tenantId, request.packageId],
        );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO "Assignment" ("tenantId", "packageId", "routeId", "routeStopId",
            "vehicleId", "courierId", "responsibleUserId", "assignmentType")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            request.tenantId,
            request.packageId,
            request.routeId,
            request.routeStopId ?? null,
            vehicleId,
            courierId,
            request.responsibleUserId ?? null,
            previous.rowCount ? 'REASSIGNMENT' : 'INITIAL',
          ],
        );
        await client.query('COMMIT');
        return { kind: 'ASSIGNED', assignmentId: inserted.rows[0].id };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        const code = (error as { code?: string }).code;
        if (attempt < 4 && (code === '40001' || code === '40P01')) continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error('RESERVATION_RETRY_EXHAUSTED');
  }
}
