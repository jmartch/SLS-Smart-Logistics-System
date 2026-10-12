import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';

export const DEMO_IDS = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  tenantSlug: 'demo-barranquilla',
  adminUserId: '20000000-0000-4000-8000-000000000001',
  receptionUserId: '20000000-0000-4000-8000-000000000002',
  activeCourierUserId: '20000000-0000-4000-8000-000000000003',
  candidateCourierUserId: '30000000-0000-4000-8000-0000000000a1',
  adminRoleId: '21000000-0000-4000-8000-000000000001',
  receptionRoleId: '21000000-0000-4000-8000-000000000002',
  courierRoleId: '21000000-0000-4000-8000-000000000003',
  zoneId: '08d92a06-4921-4989-92ff-f1917240779c',
  sectorId: '2ef99933-082e-4d24-b1a1-b5c574ca6aa5',
  shipmentTypeId: 'b268c5c7-b2b5-411d-b734-07746ae7e6e6',
  depotId: '60000000-0000-4000-8000-000000000001',
  vehicleId: '80000000-0000-4000-8000-000000000001',
  courierId: '70000000-0000-4000-8000-000000000001',
  planningRequestId: '31000000-0000-4000-8000-000000000001',
  routeId: '30000000-0000-4000-8000-000000000001',
  stopIds: [
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000003',
  ] as const,
  addressIds: [
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000003',
  ] as const,
  packageIds: [
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003',
  ] as const,
  assignmentIds: [
    '52000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000003',
  ] as const,
  deadLetterId: 'd1000000-0000-4000-8000-000000000001',
  deadLetterEventId: 'e1000000-0000-4000-8000-000000000001',
  deadLetterCorrelationId: 'c1000000-0000-4000-8000-000000000001',
  redriveRequestId: 'f1000000-0000-4000-8000-000000000001',
} as const;

export const DEMO_CREDENTIALS = {
  tenantSlug: DEMO_IDS.tenantId ? DEMO_IDS.tenantSlug : 'demo-barranquilla',
  adminEmail: 'admin@demo-baq.co',
  receptionEmail: 'recepcion@demo-baq.co',
  courierEmail: 'mensajero.ruta@demo-baq.co',
  candidateCourierEmail: 'mensajero.candidato@demo-baq.co',
  password: 'DemoPassword123!',
} as const;

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
  await admin.deliveryEvidence.deleteMany({ where: { tenantId } });
  await admin.deliveryAttempt.deleteMany({ where: { tenantId } });
  await admin.deliveryOperation.deleteMany({ where: { tenantId } });
  await admin.incident.deleteMany({ where: { tenantId } });
  await admin.routeClosure.deleteMany({ where: { tenantId } });
  await admin.assignment.deleteMany({ where: { tenantId } });
  await admin.routeStop.deleteMany({ where: { tenantId } });
  await admin.route.deleteMany({ where: { tenantId } });
  await admin.planningPackageResult.deleteMany({ where: { tenantId } });
  await admin.routePlanningRequest.deleteMany({ where: { tenantId } });
  await admin.packageStatusHistory.deleteMany({ where: { tenantId } });
  await admin.deliveryWindow.deleteMany({ where: { tenantId } });
  await admin.package.deleteMany({ where: { tenantId } });
  await admin.address.deleteMany({ where: { tenantId } });
  await admin.courierShift.deleteMany({ where: { tenantId } });
  await admin.vehicleShift.deleteMany({ where: { tenantId } });
  await admin.courier.deleteMany({ where: { tenantId } });
  await admin.vehicle.deleteMany({ where: { tenantId } });
  await admin.depot.deleteMany({ where: { tenantId } });
  await admin.sector.deleteMany({ where: { tenantId } });
  await admin.zone.deleteMany({ where: { tenantId } });
  await admin.shipmentType.deleteMany({ where: { tenantId } });
  await admin.userRole.deleteMany({ where: { tenantId } });
  await admin.rolePermission.deleteMany({ where: { tenantId } });
  await admin.role.deleteMany({ where: { tenantId } });
  await admin.user.deleteMany({ where: { tenantId } });
  await admin.tenant.deleteMany({ where: { id: tenantId } });
}

export async function seedDemo(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run prisma/seed-demo.ts');
  }

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  await admin.$connect();

  try {
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
      ],
    });

    // 5. Catalogs: Zone, Sector, ShipmentType, Depot (Barranquilla)
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

    await admin.$executeRaw`
      INSERT INTO "Depot" ("id", "tenantId", "name", "location", "timeZone", "openingHours")
      VALUES (
        ${DEMO_IDS.depotId}::uuid,
        ${DEMO_IDS.tenantId}::uuid,
        'Centro de Distribución Vía 40 - Barranquilla',
        ST_SetSRID(ST_MakePoint(-74.7889, 10.9878), 4326),
        'America/Bogota',
        '{"mon_sat":"06:00-20:00"}'::jsonb
      )
    `;

    // 6. Seeded Vehicle & Active Courier for the Planned Route
    await admin.vehicle.create({
      data: {
        id: DEMO_IDS.vehicleId,
        tenantId: DEMO_IDS.tenantId,
        plate: 'BAQ101',
        maxWeightKg: 850,
        maxVolumeM3: 6.5,
        status: 'ACTIVE',
      },
    });

    await admin.courier.create({
      data: {
        id: DEMO_IDS.courierId,
        tenantId: DEMO_IDS.tenantId,
        userId: DEMO_IDS.activeCourierUserId,
        status: 'ACTIVE',
      },
    });

    // 7. Route Planning Request & Route in Barranquilla (PLANNED with 3 ordered stops)
    await admin.routePlanningRequest.create({
      data: {
        id: DEMO_IDS.planningRequestId,
        tenantId: DEMO_IDS.tenantId,
        requestedByUserId: DEMO_IDS.adminUserId,
        status: 'COMPLETED',
        algorithm: 'KMEANS_NEAREST_NEIGHBOR',
        algorithmVersion: '1.0.0',
        timeZone: 'America/Bogota',
        parameters: {
          zoneId: DEMO_IDS.zoneId,
          depotId: DEMO_IDS.depotId,
        },
        resultSnapshot: {
          routeIds: [DEMO_IDS.routeId],
          assignedPackages: 3,
          pendingAssignmentPackages: 0,
        },
        completedAt: new Date('2026-10-12T07:00:00.000Z'),
      },
    });

    await admin.route.create({
      data: {
        id: DEMO_IDS.routeId,
        tenantId: DEMO_IDS.tenantId,
        planningRequestId: DEMO_IDS.planningRequestId,
        vehicleId: DEMO_IDS.vehicleId,
        courierId: DEMO_IDS.courierId,
        depotId: DEMO_IDS.depotId,
        state: 'PLANNED',
        serviceDate: new Date('2026-10-12T00:00:00.000Z'),
        plannedStartAt: new Date('2026-10-12T08:00:00.000Z'),
        plannedEndAt: new Date('2026-10-12T14:00:00.000Z'),
        plannedDistanceM: 4850,
        plannedDurationS: 2400,
      },
    });

    const stopsSpec = [
      {
        stopId: DEMO_IDS.stopIds[0],
        addressId: DEMO_IDS.addressIds[0],
        packageId: DEMO_IDS.packageIds[0],
        assignmentId: DEMO_IDS.assignmentIds[0],
        sequence: 1,
        latitude: 10.9961,
        longitude: -74.806,
        addressText: 'Carrera 54 # 70-15, El Prado, Barranquilla',
        trackingCode: 'PKG-BAQ-0001',
        publicTrackingToken: 'trk-demo-baq-0001',
        weightKg: 3.2,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 15,
        volumeM3: 0.009,
        priority: 'HIGH' as const,
      },
      {
        stopId: DEMO_IDS.stopIds[1],
        addressId: DEMO_IDS.addressIds[1],
        packageId: DEMO_IDS.packageIds[1],
        assignmentId: DEMO_IDS.assignmentIds[1],
        sequence: 2,
        latitude: 11.0041,
        longitude: -74.8152,
        addressText: 'Calle 76 # 51B-40, Alto Prado, Barranquilla',
        trackingCode: 'PKG-BAQ-0002',
        publicTrackingToken: 'trk-demo-baq-0002',
        weightKg: 4.5,
        lengthCm: 35,
        widthCm: 25,
        heightCm: 20,
        volumeM3: 0.0175,
        priority: 'NORMAL' as const,
      },
      {
        stopId: DEMO_IDS.stopIds[2],
        addressId: DEMO_IDS.addressIds[2],
        packageId: DEMO_IDS.packageIds[2],
        assignmentId: DEMO_IDS.assignmentIds[2],
        sequence: 3,
        latitude: 11.0112,
        longitude: -74.8265,
        addressText: 'Calle 84 # 46-22, Riomar, Barranquilla',
        trackingCode: 'PKG-BAQ-0003',
        publicTrackingToken: 'trk-demo-baq-0003',
        weightKg: 2.0,
        lengthCm: 25,
        widthCm: 20,
        heightCm: 10,
        volumeM3: 0.005,
        priority: 'URGENT' as const,
      },
    ];

    for (const item of stopsSpec) {
      await admin.address.create({
        data: {
          id: item.addressId,
          tenantId: DEMO_IDS.tenantId,
          originalText: item.addressText,
          municipalityCode: '08001',
        },
      });

      await admin.routeStop.create({
        data: {
          id: item.stopId,
          tenantId: DEMO_IDS.tenantId,
          routeId: DEMO_IDS.routeId,
          sequence: item.sequence,
          latitude: item.latitude,
          longitude: item.longitude,
          state: 'PENDING',
        },
      });

      await admin.package.create({
        data: {
          id: item.packageId,
          tenantId: DEMO_IDS.tenantId,
          addressId: item.addressId,
          shipmentTypeId: DEMO_IDS.shipmentTypeId,
          zoneId: DEMO_IDS.zoneId,
          sectorId: DEMO_IDS.sectorId,
          trackingCode: item.trackingCode,
          publicTrackingToken: item.publicTrackingToken,
          state: 'ASSIGNED_TO_ROUTE',
          weightKg: item.weightKg,
          lengthCm: item.lengthCm,
          widthCm: item.widthCm,
          heightCm: item.heightCm,
          volumeM3: item.volumeM3,
          priority: item.priority,
          serviceDurationSeconds: 300,
        },
      });

      await admin.packageStatusHistory.createMany({
        data: [
          {
            tenantId: DEMO_IDS.tenantId,
            packageId: item.packageId,
            fromState: null,
            toState: 'CLASSIFIED',
            reasonCode: 'PACKAGE_REGISTERED',
            changedByUserId: DEMO_IDS.adminUserId,
          },
          {
            tenantId: DEMO_IDS.tenantId,
            packageId: item.packageId,
            fromState: 'CLASSIFIED',
            toState: 'ASSIGNED_TO_ROUTE',
            reasonCode: 'ASSIGNED_BY_PLANNING',
            changedByUserId: DEMO_IDS.adminUserId,
          },
        ],
      });

      await admin.assignment.create({
        data: {
          id: item.assignmentId,
          tenantId: DEMO_IDS.tenantId,
          packageId: item.packageId,
          routeId: DEMO_IDS.routeId,
          routeStopId: item.stopId,
          vehicleId: DEMO_IDS.vehicleId,
          courierId: DEMO_IDS.courierId,
          responsibleUserId: DEMO_IDS.adminUserId,
          assignmentType: 'INITIAL',
          status: 'ACTIVE',
          reasonCode: 'AUTOMATIC_CLUSTER_ASSIGNMENT',
        },
      });
    }

    // 8. Deterministic DeadLetterMessage ready for Redrive demonstration (DLQ-01)
    await admin.deadLetterMessage.create({
      data: {
        id: DEMO_IDS.deadLetterId,
        tenantId: DEMO_IDS.tenantId,
        eventId: DEMO_IDS.deadLetterEventId,
        correlationId: DEMO_IDS.deadLetterCorrelationId,
        sourceQueue: 'sls.audit.integration-events.v1',
        consumerName: 'audit.integration-events.v1',
        attempts: 4,
        failureReason:
          '[TRANSIENT_EXHAUSTED] Simulated transient failure after 3 retry tiers (5s, 10s, 20s)',
        failureKey: `${DEMO_IDS.tenantId}:audit.integration-events.v1:${DEMO_IDS.deadLetterEventId}`,
        originalEvent: {
          eventId: DEMO_IDS.deadLetterEventId,
          tenantId: DEMO_IDS.tenantId,
          correlationId: DEMO_IDS.deadLetterCorrelationId,
          eventType: 'PackageRegistered',
          occurredAt: '2026-10-12T06:30:00.000Z',
          producer: 'sls-backend.packages',
          version: 1,
          payload: {
            packageId: DEMO_IDS.packageIds[0],
            fromState: null,
            toState: 'REGISTERED',
            changedByUserId: DEMO_IDS.adminUserId,
            reasonCode: 'PACKAGE_REGISTERED',
          },
        },
        transportMetadata: {
          exchange: 'sls.events.v1',
          routingKey: `tenant.${DEMO_IDS.tenantId}.PackageRegistered.v1`,
          retryCount: 3,
        },
      },
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'DEMO_SEED_READY',
          tenantId: DEMO_IDS.tenantId,
          tenantSlug: DEMO_IDS.tenantSlug,
          users: {
            admin: DEMO_CREDENTIALS.adminEmail,
            reception: DEMO_CREDENTIALS.receptionEmail,
            courier: DEMO_CREDENTIALS.courierEmail,
            candidateCourierUserId: DEMO_IDS.candidateCourierUserId,
            password: DEMO_CREDENTIALS.password,
          },
          catalogs: {
            zoneId: DEMO_IDS.zoneId,
            sectorId: DEMO_IDS.sectorId,
            shipmentTypeId: DEMO_IDS.shipmentTypeId,
            depotId: DEMO_IDS.depotId,
          },
          route: {
            routeId: DEMO_IDS.routeId,
            vehicleId: DEMO_IDS.vehicleId,
            courierId: DEMO_IDS.courierId,
            stopIds: DEMO_IDS.stopIds,
            packageIds: DEMO_IDS.packageIds,
          },
          dlqDemo: {
            deadLetterId: DEMO_IDS.deadLetterId,
            deadLetterEventId: DEMO_IDS.deadLetterEventId,
            redriveRequestId: DEMO_IDS.redriveRequestId,
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await admin.$disconnect();
  }
}

if (require.main === module) {
  seedDemo().catch((error: unknown) => {
    process.stderr.write(
      `Demo seed failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
