const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Pool } = require('pg');
const {
  PostgresAssignmentReservation,
} = require('../../dist/src/modules/assignments/infrastructure/postgres-assignment-reservation');

// Explicit opt-in. Always create/drop our own randomly named database, never the URL's database.
if (!process.env.GDB_TEST_ADMIN_URL)
  throw new Error('GDB_TEST_ADMIN_URL is required');
const adminUrl = new URL(process.env.GDB_TEST_ADMIN_URL);
const control = new Pool({ connectionString: adminUrl.toString() });
const migrations = join(__dirname, '../../prisma/migrations');
async function expectCode(fn, code) {
  await assert.rejects(fn, (e) => e.code === code);
}
async function fixture(db) {
  const tenant = randomUUID(),
    user = randomUUID(),
    zone = randomUUID(),
    sector = randomUUID();
  const shipment = randomUUID(),
    vehicle = randomUUID(),
    courier = randomUUID(),
    request = randomUUID(),
    route = randomUUID(),
    stop = randomUUID();
  await db.query('INSERT INTO "Tenant" (id,name) VALUES ($1,$2)', [
    tenant,
    'GDB fixture',
  ]);
  await db.query(
    'INSERT INTO "User" (id,"tenantId",email,"passwordHash") VALUES ($1,$2,$3,$4)',
    [user, tenant, 'test@example.invalid', 'not-a-login'],
  );
  await db.query(
    'INSERT INTO "Zone" (id,"tenantId",code,name) VALUES ($1,$2,$3,$3)',
    [zone, tenant, 'Z'],
  );
  await db.query(
    'INSERT INTO "Sector" (id,"tenantId","zoneId",code,name) VALUES ($1,$2,$3,$4,$4)',
    [sector, tenant, zone, 'S'],
  );
  await db.query(
    'INSERT INTO "ShipmentType" (id,"tenantId",code,name) VALUES ($1,$2,$3,$3)',
    [shipment, tenant, 'S'],
  );
  await db.query(
    'INSERT INTO "Vehicle" (id,"tenantId",plate,"maxWeightKg","maxVolumeM3") VALUES ($1,$2,$3,10,10)',
    [vehicle, tenant, 'TEST'],
  );
  await db.query(
    'INSERT INTO "Courier" (id,"tenantId","userId") VALUES ($1,$2,$3)',
    [courier, tenant, user],
  );
  await db.query(
    'INSERT INTO "RoutePlanningRequest" (id,"tenantId","requestedByUserId",parameters) VALUES ($1,$2,$3,$4)',
    [request, tenant, user, {}],
  );
  await db.query(
    'INSERT INTO "Route" (id,"tenantId","planningRequestId","vehicleId","courierId") VALUES ($1,$2,$3,$4,$5)',
    [route, tenant, request, vehicle, courier],
  );
  await db.query(
    'INSERT INTO "RouteStop" (id,"tenantId","routeId",sequence,latitude,longitude) VALUES ($1,$2,$3,1,11,-74)',
    [stop, tenant, route],
  );
  return {
    tenant,
    user,
    zone,
    sector,
    shipment,
    vehicle,
    courier,
    request,
    route,
    stop,
  };
}
async function makePackage(db, f, weight = 6, volume = 1) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO "Package" (id,"tenantId","zoneId","sectorId","shipmentTypeId","trackingCode","publicTrackingToken","weightKg","volumeM3",latitude,longitude)
    VALUES ($1::uuid,$2,$3,$4,$5,$1::text,$1::text,$6,$7,11,-74)`,
    [id, f.tenant, f.zone, f.sector, f.shipment, weight, volume],
  );
  return id;
}
async function run(mode) {
  const name = 'sls_gdb01_test_' + randomUUID().replaceAll('-', '');
  await control.query(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = '/' + name;
  const db = new Pool({ connectionString: url.toString() });
  const runtime = new Pool({
    connectionString: url.toString(),
    options: '-c role=sls_app',
  });
  try {
    // Simulate Prisma's metadata table for raw-SQL replay tests.
    await db.query('CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY)');
    const dirs = [
      '20260906213751_init_schema',
      '20260914120000_unique_active_assignment',
      '20260914130000_logistics_integrity',
    ];
    await db.query(
      readFileSync(join(migrations, dirs[0], 'migration.sql'), 'utf8'),
    );
    let a, b, p1, p2;
    if (mode === 'upgrade') {
      a = await fixture(db);
      b = await fixture(db);
      p1 = await makePackage(db, a);
      p2 = await makePackage(db, a);
      await db.query(
        `INSERT INTO "Assignment" ("tenantId","packageId","routeId","vehicleId","courierId","assignmentType",status)
        VALUES ($1,$2,$3,$4,$5,'INITIAL','ENDED')`,
        [a.tenant, p1, a.route, a.vehicle, a.courier],
      );
    }
    for (const dir of dirs.slice(1))
      await db.query(
        readFileSync(join(migrations, dir, 'migration.sql'), 'utf8'),
      );
    if (!a) {
      a = await fixture(db);
      b = await fixture(db);
      p1 = await makePackage(db, a);
      p2 = await makePackage(db, a);
    }
    const pb = await makePackage(db, b);
    // All 32 tenant relations plus the stronger contextual keys have compound FKs.
    const cross =
      await db.query(`SELECT conname FROM pg_constraint k WHERE contype='f'
      AND cardinality(conkey)=1 AND EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=k.confrelid AND attname='tenantId')`);
    assert.equal(cross.rowCount, 0);
    await expectCode(
      () =>
        db.query('UPDATE "Package" SET "zoneId"=$1 WHERE id=$2', [b.zone, p1]),
      '23503',
    );
    const otherZone = randomUUID();
    await db.query(
      'INSERT INTO "Zone" (id,"tenantId",code,name) VALUES ($1,$2,$3,$3)',
      [otherZone, a.tenant, 'other'],
    );
    await expectCode(
      () =>
        db.query('UPDATE "Package" SET "zoneId"=$1 WHERE id=$2', [
          otherZone,
          p1,
        ]),
      '23503',
    );
    for (const [column, value] of [
      ['weightKg', 0],
      ['volumeM3', -1],
      ['latitude', 91],
      ['longitude', 181],
      ['weightKg', 'NaN'],
    ])
      await expectCode(
        () =>
          db.query(`UPDATE "Package" SET "${column}"=$1 WHERE id=$2`, [
            value,
            p1,
          ]),
        '23514',
      );
    await expectCode(
      () =>
        db.query('UPDATE "Vehicle" SET "maxVolumeM3"=0 WHERE id=$1', [
          a.vehicle,
        ]),
      '23514',
    );
    await expectCode(
      () => db.query('UPDATE "RouteStop" SET sequence=0 WHERE id=$1', [a.stop]),
      '23514',
    );
    const client = await runtime.connect();
    try {
      assert.equal((await client.query('SELECT * FROM "Package"')).rowCount, 0);
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [
        a.tenant,
      ]);
      assert.equal((await client.query('SELECT * FROM "Tenant"')).rowCount, 1);
      assert.equal(
        (await client.query('SELECT * FROM "Package" WHERE id=$1', [pb]))
          .rowCount,
        0,
      );
      assert.equal(
        (
          await client.query('UPDATE "Package" SET "weightKg"=2 WHERE id=$1', [
            pb,
          ])
        ).rowCount,
        0,
      );
      await client.query('SAVEPOINT rls');
      await expectCode(
        () =>
          client.query('UPDATE "Package" SET "tenantId"=$1 WHERE id=$2', [
            b.tenant,
            p1,
          ]),
        '42501',
      );
      await client.query('ROLLBACK TO SAVEPOINT rls');
      for (const table of ['Tenant', 'Permission', '_prisma_migrations']) {
        await expectCode(
          () => client.query(`DELETE FROM "${table}" WHERE false`),
          '42501',
        );
        await client.query('ROLLBACK TO SAVEPOINT rls');
      }
      await client.query('ROLLBACK');
      assert.equal((await client.query('SELECT * FROM "Package"')).rowCount, 0);
    } finally {
      client.release();
    }
    const reservations = new PostgresAssignmentReservation(runtime);
    const results = await Promise.all(
      [p1, p2].map((packageId) =>
        reservations.reserve({
          tenantId: a.tenant,
          packageId,
          routeId: a.route,
          routeStopId: a.stop,
        }),
      ),
    );
    assert.equal(results.filter((x) => x.kind === 'ASSIGNED').length, 1);
    assert.equal(
      results.filter((x) => x.kind === 'PENDING_ASSIGNMENT').length,
      1,
    );
    const assigned = results[0].kind === 'ASSIGNED' ? p1 : p2;
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM "Assignment" WHERE "tenantId"=$1 AND status='ACTIVE'`,
          [a.tenant],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await reservations.reserve({
          tenantId: a.tenant,
          packageId: pb,
          routeId: a.route,
        })
      ).kind,
      'NOT_FOUND',
    );
    const badRoute = randomUUID();
    await db.query(
      'INSERT INTO "Route" (id,"tenantId","planningRequestId","vehicleId","courierId") VALUES ($1,$2,$3,$4,$5)',
      [badRoute, a.tenant, a.request, a.vehicle, a.courier],
    );
    await expectCode(
      () =>
        reservations.reserve({
          tenantId: a.tenant,
          packageId: assigned,
          routeId: badRoute,
          routeStopId: a.stop,
        }),
      '23503',
    );
    // Failed reassignment rolled back the historical close.
    const oldHistory = mode === 'upgrade' && assigned === p1 ? 1 : 0;
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM "Assignment" WHERE "packageId"=$1',
          [assigned],
        )
      ).rows[0].n,
      1 + oldHistory,
    );
    assert.equal(
      (
        await reservations.reserve({
          tenantId: a.tenant,
          packageId: assigned,
          routeId: badRoute,
        })
      ).kind,
      'ASSIGNED',
    );
    const history = await db.query(
      'SELECT status FROM "Assignment" WHERE "packageId"=$1 ORDER BY status',
      [assigned],
    );
    assert.deepEqual(history.rows.map((x) => x.status).sort(), [
      'ACTIVE',
      ...Array(1 + oldHistory).fill('ENDED'),
    ]);
    const active = (
      await db.query(
        'SELECT id FROM "Assignment" WHERE "packageId"=$1 AND status=\'ACTIVE\'',
        [assigned],
      )
    ).rows[0].id;
    await expectCode(
      () =>
        db.query('UPDATE "Assignment" SET "vehicleId"=$1 WHERE id=$2', [
          b.vehicle,
          active,
        ]),
      '23503',
    );
    await expectCode(
      () =>
        db.query('UPDATE "Assignment" SET "vehicleId"=NULL WHERE id=$1', [
          active,
        ]),
      '23514',
    );
    const wrongVehicle = randomUUID();
    await db.query(
      'INSERT INTO "Vehicle" (id,"tenantId",plate,"maxWeightKg","maxVolumeM3") VALUES ($1,$2,$3,10,10)',
      [wrongVehicle, a.tenant, 'OTHER'],
    );
    await expectCode(
      () =>
        db.query('UPDATE "Assignment" SET "vehicleId"=$1 WHERE id=$2', [
          wrongVehicle,
          active,
        ]),
      '23503',
    );
    await expectCode(
      () =>
        db.query('UPDATE "Route" SET "vehicleId"=$1 WHERE id=$2', [
          wrongVehicle,
          badRoute,
        ]),
      '23503',
    );
    // Duplicate guard on the real schema.
    await expectCode(
      () =>
        db.query(
          `INSERT INTO "Assignment" ("tenantId","packageId","routeId","vehicleId","courierId","assignmentType") VALUES ($1,$2,$3,$4,$5,'INITIAL')`,
          [a.tenant, assigned, badRoute, a.vehicle, a.courier],
        ),
      '23505',
    );
    // Independent volume limit and failed reservation preserving prior assignment.
    const tooLarge = await makePackage(db, b, 1, 11);
    assert.equal(
      (
        await reservations.reserve({
          tenantId: b.tenant,
          packageId: tooLarge,
          routeId: b.route,
        })
      ).kind,
      'PENDING_ASSIGNMENT',
    );
    const volumeOrders = await Promise.all([
      makePackage(db, b, 1, 6),
      makePackage(db, b, 1, 6),
    ]);
    const volumeResults = await Promise.all(
      volumeOrders.map((packageId) =>
        reservations.reserve({
          tenantId: b.tenant,
          packageId,
          routeId: b.route,
        }),
      ),
    );
    assert.equal(volumeResults.filter((x) => x.kind === 'ASSIGNED').length, 1);
    assert.equal(
      volumeResults.filter((x) => x.kind === 'PENDING_ASSIGNMENT').length,
      1,
    );
    console.log(
      `PASS ${mode}: constraints, RLS/grants, concurrent capacity, atomic reassignment`,
    );
  } finally {
    await runtime.end();
    await db.end();
    await control.query(`DROP DATABASE "${name}"`);
  }
}
(async () => {
  try {
    await run('empty');
    await run('upgrade');
  } finally {
    await control.end();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
