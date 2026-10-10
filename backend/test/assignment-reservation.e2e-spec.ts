import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaAssignmentReservation } from '../src/modules/assignments/infrastructure/prisma-assignment-reservation';

type ReservationScenario = 'fresh' | 'history';

interface TenantFixture {
  readonly tenantId: string;
  readonly userId: string;
  readonly zoneId: string;
  readonly sectorId: string;
  readonly shipmentTypeId: string;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly planningRequestId: string;
  readonly routeId: string;
  readonly routeStopId: string;
}

interface ReservationScenarioFixture {
  readonly primary: TenantFixture;
  readonly foreign: TenantFixture;
  readonly firstPackageId: string;
  readonly secondPackageId: string;
  readonly foreignPackageId: string;
}

async function createTenantFixture(
  transaction: Prisma.TransactionClient,
  label: string,
): Promise<TenantFixture> {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const zoneId = randomUUID();
  const sectorId = randomUUID();
  const shipmentTypeId = randomUUID();
  const vehicleId = randomUUID();
  const courierId = randomUUID();
  const planningRequestId = randomUUID();
  const routeId = randomUUID();
  const routeStopId = randomUUID();

  await transaction.tenant.create({
    data: {
      id: tenantId,
      name: `GDB-01 ${label} ${tenantId}`,
      slug: `gdb-01-${tenantId}`,
      status: 'ACTIVE',
    },
  });

  await transaction.user.create({
    data: {
      id: userId,
      tenantId,
      email: `gdb01-${userId}@example.test`,
      passwordHash: 'not-a-real-password',
      status: 'ACTIVE',
    },
  });

  await transaction.zone.create({
    data: {
      id: zoneId,
      tenantId,
      code: `Z${zoneId.slice(0, 6)}`,
      name: `GDB-01 zone ${label}`,
    },
  });

  await transaction.sector.create({
    data: {
      id: sectorId,
      tenantId,
      zoneId,
      code: `S${sectorId.slice(0, 6)}`,
      name: `GDB-01 sector ${label}`,
    },
  });

  await transaction.shipmentType.create({
    data: {
      id: shipmentTypeId,
      tenantId,
      code: `T${shipmentTypeId.slice(0, 6)}`,
      name: `GDB-01 shipment ${label}`,
    },
  });

  await transaction.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      plate: `GDB${vehicleId.slice(0, 5)}`,
      maxWeightKg: 10,
      maxVolumeM3: 10,
      status: 'ACTIVE',
    },
  });

  await transaction.courier.create({
    data: {
      id: courierId,
      tenantId,
      userId,
      status: 'ACTIVE',
    },
  });

  await transaction.routePlanningRequest.create({
    data: {
      id: planningRequestId,
      tenantId,
      requestedByUserId: userId,
      parameters: {},
    },
  });

  await transaction.route.create({
    data: {
      id: routeId,
      tenantId,
      planningRequestId,
      vehicleId,
      courierId,
    },
  });

  await transaction.routeStop.create({
    data: {
      id: routeStopId,
      tenantId,
      routeId,
      sequence: 1,
      latitude: 11,
      longitude: -74,
    },
  });

  return {
    tenantId,
    userId,
    zoneId,
    sectorId,
    shipmentTypeId,
    vehicleId,
    courierId,
    planningRequestId,
    routeId,
    routeStopId,
  };
}

async function createPackageFixture(
  transaction: Prisma.TransactionClient,
  fixture: TenantFixture,
  weightKg = 6,
  volumeM3 = 1,
): Promise<string> {
  const packageId = randomUUID();
  const addressId = randomUUID();

  await transaction.address.create({
    data: {
      id: addressId,
      tenantId: fixture.tenantId,
      originalText: `GDB-01 fixture address ${packageId}`,
      municipalityCode: '08001',
    },
  });

  await transaction.package.create({
    data: {
      id: packageId,
      tenantId: fixture.tenantId,
      zoneId: fixture.zoneId,
      sectorId: fixture.sectorId,
      shipmentTypeId: fixture.shipmentTypeId,
      trackingCode: packageId,
      publicTrackingToken: packageId,
      weightKg,
      volumeM3,
      addressId,
      lengthCm: 100,
      widthCm: 100,
      heightCm: volumeM3 * 100,
    },
  });

  return packageId;
}

async function createScenarioFixture(
  transaction: Prisma.TransactionClient,
  scenario: ReservationScenario,
): Promise<ReservationScenarioFixture> {
  const primary = await createTenantFixture(transaction, `${scenario} primary`);
  const foreign = await createTenantFixture(transaction, `${scenario} foreign`);
  const firstPackageId = await createPackageFixture(transaction, primary);
  const secondPackageId = await createPackageFixture(transaction, primary);
  const foreignPackageId = await createPackageFixture(transaction, foreign);

  if (scenario === 'history') {
    await transaction.assignment.create({
      data: {
        tenantId: primary.tenantId,
        packageId: firstPackageId,
        routeId: primary.routeId,
        vehicleId: primary.vehicleId,
        courierId: primary.courierId,
        assignmentType: 'INITIAL',
        status: 'ENDED',
      },
    });
  }

  return {
    primary,
    foreign,
    firstPackageId,
    secondPackageId,
    foreignPackageId,
  };
}

async function expectCode(
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation()).rejects.toMatchObject({ code });
}

describe('Reserva integral de asignaciones GDB-01', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
  const app = new PrismaService();

  const reservations = new PrismaAssignmentReservation(app);

  const database = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const runtime = new Pool({
    connectionString: process.env.RUNTIME_DATABASE_URL,
  });

  const scenarioFixtures = new Map<
    ReservationScenario,
    ReservationScenarioFixture
  >();

  beforeAll(async () => {
    for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
      const connectionString = process.env[variable];

      if (!connectionString) {
        throw new Error(`${variable} is required`);
      }

      const databasePath = new URL(connectionString).pathname;

      if (!/^\/sls_gdb01_[0-9a-f]{32}$/.test(databasePath)) {
        throw new Error(
          `${variable} must point to a disposable database created by gdb-01.cjs`,
        );
      }
    }

    await admin.$connect();
    await app.$connect();

    for (const scenario of ['fresh', 'history'] as const) {
      const fixture = await admin.$transaction((transaction) =>
        createScenarioFixture(transaction, scenario),
      );
      scenarioFixtures.set(scenario, fixture);
    }
  });

  afterAll(async () => {
    await runtime.end();
    await database.end();
    await app.$disconnect();
    await admin.$disconnect();
  });

  it.each(['fresh', 'history'] as const)(
    'aplica aislamiento RLS en el escenario %s',
    async (scenario) => {
      const fixture = scenarioFixtures.get(scenario);

      if (!fixture) {
        throw new Error(`Missing fixture for ${scenario}`);
      }

      const role = await app.$queryRaw<Array<{ name: string }>>`
                    SELECT current_user AS name
                `;

      expect(role[0]?.name).toBe('sls_app');

      const client = await runtime.connect();

      try {
        const withoutContext = await client.query('SELECT id FROM "Package"');
        expect(withoutContext.rowCount).toBe(0);

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
          fixture.primary.tenantId,
        ]);

        const ownTenant = await client.query(
          'SELECT id FROM "Tenant" WHERE id = $1',
          [fixture.primary.tenantId],
        );
        expect(ownTenant.rowCount).toBe(1);

        const foreignPackage = await client.query(
          'SELECT id FROM "Package" WHERE id = $1',
          [fixture.foreignPackageId],
        );
        expect(foreignPackage.rowCount).toBe(0);

        const foreignUpdate = await client.query(
          'UPDATE "Package" SET priority = priority WHERE id = $1',
          [fixture.foreignPackageId],
        );
        expect(foreignUpdate.rowCount).toBe(0);

        await client.query('SAVEPOINT rls_check');

        await expectCode(
          () =>
            client.query('UPDATE "Package" SET "tenantId" = $1 WHERE id = $2', [
              fixture.foreign.tenantId,
              fixture.firstPackageId,
            ]),
          '42501',
        );

        await client.query('ROLLBACK TO SAVEPOINT rls_check');

        for (const table of [
          '"Tenant"',
          '"Permission"',
          '"_prisma_migrations"',
        ]) {
          await expectCode(
            () => client.query(`DELETE FROM ${table} WHERE false`),
            '42501',
          );

          await client.query('ROLLBACK TO SAVEPOINT rls_check');
        }

        await client.query('ROLLBACK');

        const afterTransaction = await client.query('SELECT id FROM "Package"');
        expect(afterTransaction.rowCount).toBe(0);
      } finally {
        client.release();
      }
    },
  );

  it.each(['fresh', 'history'] as const)(
    'protege la integridad logística en el escenario %s',
    async (scenario) => {
      const fixture = scenarioFixtures.get(scenario);

      if (!fixture) {
        throw new Error(`Missing fixture for ${scenario}`);
      }

      const scalarTenantForeignKeys = await database.query(`
                SELECT conname
                FROM pg_constraint constraint_definition
                WHERE contype = 'f'
                    AND cardinality(conkey) = 1
                    AND EXISTS (
                    SELECT 1
                    FROM pg_attribute
                    WHERE attrelid = constraint_definition.confrelid
                        AND attname = 'tenantId'
                    )
            `);

      expect(scalarTenantForeignKeys.rowCount).toBe(0);

      await expectCode(
        () =>
          database.query('UPDATE "Package" SET "zoneId" = $1 WHERE id = $2', [
            fixture.foreign.zoneId,
            fixture.firstPackageId,
          ]),
        '23503',
      );

      const otherZoneId = randomUUID();

      await admin.zone.create({
        data: {
          id: otherZoneId,
          tenantId: fixture.primary.tenantId,
          code: `O${otherZoneId.slice(0, 6)}`,
          name: `Other zone ${scenario}`,
        },
      });

      await expectCode(
        () =>
          database.query('UPDATE "Package" SET "zoneId" = $1 WHERE id = $2', [
            otherZoneId,
            fixture.firstPackageId,
          ]),
        '23503',
      );

      const invalidPackageValues: Array<{
        column: 'weightKg' | 'volumeM3' | 'lengthCm' | 'heightCm';
        value: number | string;
      }> = [
        { column: 'weightKg', value: 0 },
        { column: 'volumeM3', value: -1 },
        { column: 'lengthCm', value: 0 },
        { column: 'heightCm', value: -1 },
        { column: 'weightKg', value: 'NaN' },
      ];

      for (const { column, value } of invalidPackageValues) {
        await expectCode(
          () =>
            database.query(
              `UPDATE "Package" SET "${column}" = $1 WHERE id = $2`,
              [value, fixture.firstPackageId],
            ),
          '23514',
        );
      }

      await expectCode(
        () =>
          database.query(
            'UPDATE "Vehicle" SET "maxVolumeM3" = 0 WHERE id = $1',
            [fixture.primary.vehicleId],
          ),
        '23514',
      );

      await expectCode(
        () =>
          database.query('UPDATE "RouteStop" SET sequence = 0 WHERE id = $1', [
            fixture.primary.routeStopId,
          ]),
        '23514',
      );
    },
  );

  it.each(['fresh', 'history'] as const)(
    'reserva concurrentemente respetando el peso en el escenario %s',
    async (scenario) => {
      const fixture = scenarioFixtures.get(scenario);

      if (!fixture) {
        throw new Error(`Missing fixture for ${scenario}`);
      }

      const results = await Promise.all(
        [fixture.firstPackageId, fixture.secondPackageId].map((packageId) =>
          reservations.reserve({
            tenantId: fixture.primary.tenantId,
            packageId,
            routeId: fixture.primary.routeId,
            routeStopId: fixture.primary.routeStopId,
          }),
        ),
      );

      expect(
        results.filter((result) => result.kind === 'ASSIGNED'),
      ).toHaveLength(1);

      expect(
        results.filter((result) => result.kind === 'PENDING_ASSIGNMENT'),
      ).toHaveLength(1);

      const activeAssignments = await admin.assignment.count({
        where: {
          tenantId: fixture.primary.tenantId,
          status: 'ACTIVE',
        },
      });

      expect(activeAssignments).toBe(1);

      const crossTenantResult = await reservations.reserve({
        tenantId: fixture.primary.tenantId,
        packageId: fixture.foreignPackageId,
        routeId: fixture.primary.routeId,
      });

      expect(crossTenantResult.kind).toBe('NOT_FOUND');
    },
  );

  it.each(['fresh', 'history'] as const)(
    'preserva el historial cuando la parada no pertenece a la ruta en %s',
    async (scenario) => {
      const fixture = scenarioFixtures.get(scenario);

      if (!fixture) {
        throw new Error(`Missing fixture for ${scenario}`);
      }

      const activeAssignment = await admin.assignment.findFirst({
        where: {
          tenantId: fixture.primary.tenantId,
          status: 'ACTIVE',
        },
        select: {
          packageId: true,
          routeId: true,
        },
      });

      if (!activeAssignment) {
        throw new Error(`Missing active assignment for ${scenario}`);
      }

      const historyBefore = await admin.assignment.count({
        where: {
          tenantId: fixture.primary.tenantId,
          packageId: activeAssignment.packageId,
        },
      });

      const targetRouteId = randomUUID();

      await admin.route.create({
        data: {
          id: targetRouteId,
          tenantId: fixture.primary.tenantId,
          planningRequestId: fixture.primary.planningRequestId,
          vehicleId: fixture.primary.vehicleId,
          courierId: fixture.primary.courierId,
        },
      });

      const result = await reservations.reserve({
        tenantId: fixture.primary.tenantId,
        packageId: activeAssignment.packageId,
        routeId: targetRouteId,
        routeStopId: fixture.primary.routeStopId,
      });

      expect(result.kind).toBe('NOT_FOUND');

      const historyAfter = await admin.assignment.count({
        where: {
          tenantId: fixture.primary.tenantId,
          packageId: activeAssignment.packageId,
        },
      });

      expect(historyAfter).toBe(historyBefore);

      const assignmentAfter = await admin.assignment.findFirst({
        where: {
          tenantId: fixture.primary.tenantId,
          packageId: activeAssignment.packageId,
          status: 'ACTIVE',
        },
        select: {
          routeId: true,
        },
      });

      expect(assignmentAfter?.routeId).toBe(fixture.primary.routeId);
    },
  );

  it.each(['fresh', 'history'] as const)(
    'reasigna atómicamente y conserva el historial en %s',
    async (scenario) => {
      const fixture = scenarioFixtures.get(scenario);

      if (!fixture) {
        throw new Error(`Missing fixture for ${scenario}`);
      }

      const currentAssignment = await admin.assignment.findFirst({
        where: {
          tenantId: fixture.primary.tenantId,
          status: 'ACTIVE',
        },
        select: {
          packageId: true,
        },
      });

      if (!currentAssignment) {
        throw new Error(`Missing active assignment for ${scenario}`);
      }

      const historyBefore = await admin.assignment.findMany({
        where: {
          tenantId: fixture.primary.tenantId,
          packageId: currentAssignment.packageId,
        },
        select: {
          status: true,
        },
      });

      const endedBefore = historyBefore.filter(
        (assignment) => assignment.status === 'ENDED',
      ).length;

      const targetRouteId = randomUUID();

      await admin.route.create({
        data: {
          id: targetRouteId,
          tenantId: fixture.primary.tenantId,
          planningRequestId: fixture.primary.planningRequestId,
          vehicleId: fixture.primary.vehicleId,
          courierId: fixture.primary.courierId,
        },
      });

      const result = await reservations.reserve({
        tenantId: fixture.primary.tenantId,
        packageId: currentAssignment.packageId,
        routeId: targetRouteId,
      });

      expect(result.kind).toBe('ASSIGNED');

      const historyAfter = await admin.assignment.findMany({
        where: {
          tenantId: fixture.primary.tenantId,
          packageId: currentAssignment.packageId,
        },
        select: {
          status: true,
          routeId: true,
          assignmentType: true,
        },
      });

      expect(historyAfter).toHaveLength(historyBefore.length + 1);

      const activeAssignments = historyAfter.filter(
        (assignment) => assignment.status === 'ACTIVE',
      );

      const endedAssignments = historyAfter.filter(
        (assignment) => assignment.status === 'ENDED',
      );

      expect(activeAssignments).toHaveLength(1);
      expect(endedAssignments).toHaveLength(endedBefore + 1);

      expect(activeAssignments[0]).toMatchObject({
        routeId: targetRouteId,
        assignmentType: 'REASSIGNMENT',
      });
    },
  );

  it.each(['fresh', 'history'] as const)(
    'protege la coherencia de la asignación activa en %s',
    async (scenario) => {
      const fixture = scenarioFixtures.get(scenario);

      if (!fixture) {
        throw new Error(`Missing fixture for ${scenario}`);
      }

      const activeAssignment = await admin.assignment.findFirst({
        where: {
          tenantId: fixture.primary.tenantId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          packageId: true,
          routeId: true,
        },
      });

      if (!activeAssignment) {
        throw new Error(`Missing active assignment for ${scenario}`);
      }

      await expectCode(
        () =>
          database.query(
            'UPDATE "Assignment" SET "vehicleId" = $1 WHERE id = $2',
            [fixture.foreign.vehicleId, activeAssignment.id],
          ),
        '23503',
      );

      await expectCode(
        () =>
          database.query(
            'UPDATE "Assignment" SET "vehicleId" = NULL WHERE id = $1',
            [activeAssignment.id],
          ),
        '23514',
      );

      const wrongVehicleId = randomUUID();

      await admin.vehicle.create({
        data: {
          id: wrongVehicleId,
          tenantId: fixture.primary.tenantId,
          plate: `ALT${wrongVehicleId.slice(0, 5)}`,
          maxWeightKg: 10,
          maxVolumeM3: 10,
          status: 'ACTIVE',
        },
      });

      await expectCode(
        () =>
          database.query(
            'UPDATE "Assignment" SET "vehicleId" = $1 WHERE id = $2',
            [wrongVehicleId, activeAssignment.id],
          ),
        '23503',
      );

      await expectCode(
        () =>
          database.query('UPDATE "Route" SET "vehicleId" = $1 WHERE id = $2', [
            wrongVehicleId,
            activeAssignment.routeId,
          ]),
        '23503',
      );

      await expectCode(
        () =>
          database.query(
            `INSERT INTO "Assignment"
                            (
                            "tenantId",
                            "packageId",
                            "routeId",
                            "vehicleId",
                            "courierId",
                            "assignmentType"
                            )
                        VALUES ($1, $2, $3, $4, $5, 'INITIAL')`,
            [
              fixture.primary.tenantId,
              activeAssignment.packageId,
              activeAssignment.routeId,
              fixture.primary.vehicleId,
              fixture.primary.courierId,
            ],
          ),
        '23505',
      );
    },
  );

  it.each(['fresh', 'history'] as const)(
    'reserva respetando la capacidad de volumen en %s',
    async (scenario) => {
      const fixture = scenarioFixtures.get(scenario);

      if (!fixture) {
        throw new Error(`Missing fixture for ${scenario}`);
      }

      const tooLargePackageId = await admin.$transaction((transaction) =>
        createPackageFixture(transaction, fixture.foreign, 1, 11),
      );

      const tooLargeResult = await reservations.reserve({
        tenantId: fixture.foreign.tenantId,
        packageId: tooLargePackageId,
        routeId: fixture.foreign.routeId,
      });

      expect(tooLargeResult).toMatchObject({
        kind: 'PENDING_ASSIGNMENT',
        reason: 'NO_CAPACITY',
      });

      const volumePackageIds = await admin.$transaction(async (transaction) => {
        const firstPackageId = await createPackageFixture(
          transaction,
          fixture.foreign,
          1,
          6,
        );

        const secondPackageId = await createPackageFixture(
          transaction,
          fixture.foreign,
          1,
          6,
        );

        return [firstPackageId, secondPackageId];
      });

      const volumeResults = await Promise.all(
        volumePackageIds.map((packageId) =>
          reservations.reserve({
            tenantId: fixture.foreign.tenantId,
            packageId,
            routeId: fixture.foreign.routeId,
          }),
        ),
      );

      expect(
        volumeResults.filter((result) => result.kind === 'ASSIGNED'),
      ).toHaveLength(1);

      expect(
        volumeResults.filter((result) => result.kind === 'PENDING_ASSIGNMENT'),
      ).toHaveLength(1);

      const activeAssignments = await admin.assignment.count({
        where: {
          tenantId: fixture.foreign.tenantId,
          status: 'ACTIVE',
        },
      });

      expect(activeAssignments).toBe(1);
    },
  );
});
