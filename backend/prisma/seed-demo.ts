import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service';
import { RegisterVehicleService } from '../src/modules/vehicles/application/register-vehicle.service';
import { PrismaVehicleAdapter } from '../src/modules/vehicles/infrastructure/prisma-vehicle.adapter';
import { RegisterCourierService } from '../src/modules/couriers/application/register-courier.service';
import { PrismaCourierAdapter } from '../src/modules/couriers/infrastructure/prisma-courier.adapter';
import { PrismaUserDirectoryAdapter } from '../src/modules/users/infrastructure/prisma-user-directory.adapter';
import { importOsmDemo } from './import-osm-demo';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';

import { DEMO_IDS, DEMO_CREDENTIALS } from './demo-config';
import { prepareOsmDemo } from './prepare-osm-demo';

export { DEMO_IDS, DEMO_CREDENTIALS } from './demo-config';

const REQUIRED_PERMISSIONS = [
  {
    code: 'MANAGE_TENANT',
    description: 'Administrar catálogos, vehículos y mensajeros del tenant',
  },
  {
    code: 'MANAGE_EMPLOYEES',
    description: 'Administrar usuarios y roles del tenant',
  },
  {
    code: 'REGISTER_PACKAGES',
    description: 'Registrar paquetes en recepción',
  },
  {
    code: 'CLASSIFY_PACKAGES',
    description: 'Clasificar paquetes y resolver pendientes',
  },
  {
    code: 'COORDINATE_ROUTES',
    description: 'Planificar, preparar y cerrar rutas',
  },
  {
    code: 'OPERATE_DELIVERIES',
    description: 'Operar rutas asignadas y registrar entregas',
  },
] as const;

async function cleanDemoTenant(
  admin: PrismaClient,
  tenantId: string,
): Promise<void> {
  await admin.session.deleteMany({ where: { tenantId } });
  await admin.deadLetterRedrive.deleteMany({ where: { tenantId } });
  await admin.deadLetterMessage.deleteMany({ where: { tenantId } });
  await admin.processedEvent.deleteMany({ where: { tenantId } });
  await admin.outboxEvent.deleteMany({ where: { tenantId } });
  await admin.auditLog.deleteMany({ where: { tenantId } });
  await admin.notification.deleteMany({ where: { tenantId } });
  await admin.notificationTemplate.deleteMany({ where: { tenantId } });
  await admin.deliveryEvidence.deleteMany({ where: { tenantId } });
  await admin.deliveryAttempt.deleteMany({ where: { tenantId } });
  await admin.deliveryOperation.deleteMany({ where: { tenantId } });
  await admin.incident.deleteMany({ where: { tenantId } });
  await admin.routeClosure.deleteMany({ where: { tenantId } });
  await admin.assignment.deleteMany({ where: { tenantId } });
  await admin.routeLegEdge.deleteMany({ where: { tenantId } });
  await admin.routeLeg.deleteMany({ where: { tenantId } });
  await admin.routeStop.deleteMany({ where: { tenantId } });
  await admin.route.deleteMany({ where: { tenantId } });
  await admin.planningPackageResult.deleteMany({ where: { tenantId } });
  await admin.routePlanningRequest.deleteMany({ where: { tenantId } });
  await admin.packageStatusHistory.deleteMany({ where: { tenantId } });
  await admin.deliveryWindow.deleteMany({ where: { tenantId } });
  await admin.package.deleteMany({ where: { tenantId } });
  await admin.networkAttachment.deleteMany({ where: { tenantId } });
  await admin.geocodingAttempt.updateMany({
    where: { tenantId },
    data: { selectedCandidateId: null },
  });
  await admin.geocodingReview.deleteMany({ where: { tenantId } });
  await admin.geocodingCandidate.deleteMany({ where: { tenantId } });
  await admin.geocodingAttempt.deleteMany({ where: { tenantId } });
  await admin.address.deleteMany({ where: { tenantId } });
  await admin.courierShift.deleteMany({ where: { tenantId } });
  await admin.vehicleShift.deleteMany({ where: { tenantId } });
  await admin.courier.deleteMany({ where: { tenantId } });
  await admin.vehicle.deleteMany({ where: { tenantId } });
  await admin.depot.deleteMany({ where: { tenantId } });
  await admin.sector.deleteMany({ where: { tenantId } });
  await admin.zone.deleteMany({ where: { tenantId } });
  await admin.shipmentType.deleteMany({ where: { tenantId } });
  await admin.routingRule.deleteMany({ where: { tenantId } });
  await admin.userRole.deleteMany({ where: { tenantId } });
  await admin.rolePermission.deleteMany({ where: { tenantId } });
  await admin.role.deleteMany({ where: { tenantId } });
  await admin.user.deleteMany({ where: { tenantId } });
  await admin.tenant.deleteMany({ where: { id: tenantId } });
}

/** Reset application data, keeping migrations, permissions and platform access. */
async function resetApplicationData(admin: PrismaClient): Promise<void> {
  const tables = Object.values(Prisma.ModelName)
    .filter((name) => name !== 'PlatformAdmin' && name !== 'Permission')
    .map((name) => `"public"."${name}"`);
  // Names come only from the generated schema, never from CLI or request input.
  await admin.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY`,
  );
}

export async function seedDemoGeography(): Promise<string> {
  return importOsmDemo();
}

export async function seedDemo(
  options: { geographyOnly?: boolean; resetAll?: boolean } = {},
): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run prisma/seed-demo.ts');
  }

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  if (options.geographyOnly && options.resetAll) {
    throw new Error('--geography-only cannot be combined with --reset-all');
  }

  await admin.$connect();

  try {
    if (options.geographyOnly) {
      await seedDemoGeography();
      process.stdout.write(
        'Demo geography ready; existing tenant data preserved.\n',
      );
      return;
    }

    if (options.resetAll) await resetApplicationData(admin);

    // 0. Ensure permissions exist
    for (const perm of REQUIRED_PERMISSIONS) {
      await admin.permission.upsert({
        where: { code: perm.code },
        update: { description: perm.description },
        create: { code: perm.code, description: perm.description },
      });
    }

    const allPermissions = await admin.permission.findMany({
      where: {
        code: { in: REQUIRED_PERMISSIONS.map((p) => p.code) },
      },
    });
    const permByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

    // 1. Clean existing demo tenant data for deterministic repeatability
    await cleanDemoTenant(admin, DEMO_IDS.tenantId);

    // 2. Create Demo Tenant (Barranquilla)
    await admin.tenant.create({
      data: {
        id: DEMO_IDS.tenantId,
        name: 'Mensajería Barranquilla Demo S.A.S.',
        slug: DEMO_IDS.tenantSlug,
        status: 'ACTIVE',
      },
    });

    // 3. Create Users
    const passwordHash = await hashPassword(DEMO_CREDENTIALS.password);

    await admin.user.createMany({
      data: [
        {
          id: DEMO_IDS.adminUserId,
          tenantId: DEMO_IDS.tenantId,
          email: DEMO_CREDENTIALS.adminEmail,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.receptionUserId,
          tenantId: DEMO_IDS.tenantId,
          email: DEMO_CREDENTIALS.receptionEmail,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.activeCourierUserId,
          tenantId: DEMO_IDS.tenantId,
          email: DEMO_CREDENTIALS.courierEmail,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: DEMO_IDS.candidateCourierUserId,
          tenantId: DEMO_IDS.tenantId,
          email: DEMO_CREDENTIALS.candidateCourierEmail,
          passwordHash,
          status: 'ACTIVE',
        },
      ],
    });

    // 4. Create Roles, RolePermissions & UserRoles
    await admin.role.createMany({
      data: [
        {
          id: DEMO_IDS.adminRoleId,
          tenantId: DEMO_IDS.tenantId,
          name: 'ADMIN',
        },
        {
          id: DEMO_IDS.receptionRoleId,
          tenantId: DEMO_IDS.tenantId,
          name: 'RECEPTION',
        },
        {
          id: DEMO_IDS.courierRoleId,
          tenantId: DEMO_IDS.tenantId,
          name: 'COURIER',
        },
      ],
    });

    await admin.rolePermission.createMany({
      data: [
        ...Array.from(permByCode.values()).map((permissionId) => ({
          tenantId: DEMO_IDS.tenantId,
          roleId: DEMO_IDS.adminRoleId,
          permissionId,
        })),
        {
          tenantId: DEMO_IDS.tenantId,
          roleId: DEMO_IDS.receptionRoleId,
          permissionId: permByCode.get('REGISTER_PACKAGES')!,
        },
        {
          tenantId: DEMO_IDS.tenantId,
          roleId: DEMO_IDS.courierRoleId,
          permissionId: permByCode.get('OPERATE_DELIVERIES')!,
        },
      ],
    });

    await admin.userRole.createMany({
      data: [
        {
          tenantId: DEMO_IDS.tenantId,
          userId: DEMO_IDS.adminUserId,
          roleId: DEMO_IDS.adminRoleId,
        },
        {
          tenantId: DEMO_IDS.tenantId,
          userId: DEMO_IDS.receptionUserId,
          roleId: DEMO_IDS.receptionRoleId,
        },
        {
          tenantId: DEMO_IDS.tenantId,
          userId: DEMO_IDS.activeCourierUserId,
          roleId: DEMO_IDS.courierRoleId,
        },
        {
          tenantId: DEMO_IDS.tenantId,
          userId: DEMO_IDS.candidateCourierUserId,
          roleId: DEMO_IDS.courierRoleId,
        },
      ],
    });

    // 5. Tenant catalogs. Geography and depot come from the verified OSM extract.

    await admin.zone.create({
      data: {
        id: DEMO_IDS.zoneId,
        tenantId: DEMO_IDS.tenantId,
        code: 'NORTH',
        name: 'Zona Norte Barranquilla',
      },
    });

    await admin.sector.create({
      data: {
        id: DEMO_IDS.sectorId,
        tenantId: DEMO_IDS.tenantId,
        zoneId: DEMO_IDS.zoneId,
        code: 'N-PRADO',
        name: 'El Prado - Alto Prado',
      },
    });

    await admin.shipmentType.create({
      data: {
        id: DEMO_IDS.shipmentTypeId,
        tenantId: DEMO_IDS.tenantId,
        code: 'STANDARD',
        name: 'Envío Urbano Estándar 24h',
        active: true,
      },
    });

    // Operational resources use the same application services as the HTTP API.
    const db = new PrismaService();
    try {
      const context = {
        tenantId: DEMO_IDS.tenantId,
        actorUserId: DEMO_IDS.adminUserId,
        correlationId: randomUUID(),
      };
      const vehicle = await new RegisterVehicleService(
        new PrismaVehicleAdapter(db),
      ).execute(DEMO_IDS.tenantId, {
        plate: 'BAQ101',
        maxWeightKg: '850',
        maxVolumeM3: '6.5',
      });
      if (!vehicle.ok) throw new Error(`Demo vehicle failed: ${vehicle.code}`);
      const courier = await new RegisterCourierService(
        new PrismaCourierAdapter(db, new PrismaUserDirectoryAdapter()),
      ).execute(context, { userId: DEMO_IDS.activeCourierUserId });
      if (!courier.ok) throw new Error(`Demo courier failed: ${courier.code}`);

      const preparation = await prepareOsmDemo({ quiet: true });
      process.stdout.write(
        `${JSON.stringify(
          {
            status: 'DEMO_SEED_READY',
            resetScope: options.resetAll
              ? 'ALL_OPERATIONAL_DATA'
              : 'DEMO_TENANT',
            tenantId: DEMO_IDS.tenantId,
            tenantSlug: DEMO_IDS.tenantSlug,
            users: {
              admin: DEMO_CREDENTIALS.adminEmail,
              reception: DEMO_CREDENTIALS.receptionEmail,
              courier: DEMO_CREDENTIALS.courierEmail,
              candidateCourierUserId: DEMO_IDS.candidateCourierUserId,
            },
            vehicle: vehicle.vehicle,
            courier: courier.courier,
            ...preparation,
            nextStep:
              'Classify packages in the UI, then plan routes. No routes or assignments were seeded.',
          },
          null,
          2,
        )}\n`,
      );
    } finally {
      await db.$disconnect();
    }
  } finally {
    await admin.$disconnect();
  }
}

if (require.main === module) {
  seedDemo({
    geographyOnly: process.argv.includes('--geography-only'),
    resetAll: process.argv.includes('--reset-all'),
  }).catch((error: unknown) => {
    process.stderr.write(
      `Demo seed failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
