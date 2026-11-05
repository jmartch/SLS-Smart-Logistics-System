import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';

export interface DeliveryLifecycleEnvironment {
  tenantAId: string;
  tenantBId: string;
  userCoordAId: string;
  courierUser1Id: string;
  courierUser2Id: string;
  courierUserBId: string;
  unauthorizedUserAId: string;
  courier1Id: string;
  courier2Id: string;
  courierBId: string;
  vehicle1Id: string;
  vehicleBId: string;
  zoneAId: string;
  zoneBId: string;
  depotAId: string;
  depotBId: string;
  shipmentTypeAId: string;
  shipmentTypeBId: string;
  addressAId: string;
  addressBId: string;
}

export async function seedDeliveryLifecycleEnvironment(
  admin: PrismaClient,
): Promise<DeliveryLifecycleEnvironment> {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userCoordAId = randomUUID();
  const courierUser1Id = randomUUID();
  const courierUser2Id = randomUUID();
  const courierUserBId = randomUUID();
  const unauthorizedUserAId = randomUUID();

  const courier1Id = randomUUID();
  const courier2Id = randomUUID();
  const courierBId = randomUUID();

  const vehicle1Id = randomUUID();
  const vehicleBId = randomUUID();

  const zoneAId = randomUUID();
  const zoneBId = randomUUID();
  const depotAId = randomUUID();
  const depotBId = randomUUID();
  const shipmentTypeAId = randomUUID();
  const shipmentTypeBId = randomUUID();

  const addressAId = randomUUID();
  const addressBId = randomUUID();

  // 1. Tenants
  await admin.tenant.createMany({
    data: [
      {
        id: tenantAId,
        name: `Tenant A ${tenantAId}`,
        slug: `delivery-01-a-${tenantAId}`,
        status: 'ACTIVE',
      },
      {
        id: tenantBId,
        name: `Tenant B ${tenantBId}`,
        slug: `delivery-01-b-${tenantBId}`,
        status: 'ACTIVE',
      },
    ],
  });

  // 2. Users
  await admin.user.createMany({
    data: [
      {
        id: userCoordAId,
        tenantId: tenantAId,
        email: `coord_${userCoordAId.slice(0, 8)}@tenanta.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
      {
        id: courierUser1Id,
        tenantId: tenantAId,
        email: `courier1_${courierUser1Id.slice(0, 8)}@tenanta.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
      {
        id: courierUser2Id,
        tenantId: tenantAId,
        email: `courier2_${courierUser2Id.slice(0, 8)}@tenanta.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
      {
        id: courierUserBId,
        tenantId: tenantBId,
        email: `courierB_${courierUserBId.slice(0, 8)}@tenantb.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
      {
        id: unauthorizedUserAId,
        tenantId: tenantAId,
        email: `unauth_${unauthorizedUserAId.slice(0, 8)}@tenanta.com`,
        passwordHash: 'dummy-hash',
        status: 'ACTIVE',
      },
    ],
  });

  // 2.1 Roles and UserRoles
  const roleCoordId = randomUUID();
  const roleCourierId = randomUUID();

  await admin.role.createMany({
    data: [
      { id: roleCoordId, tenantId: tenantAId, name: 'COORDINATOR' },
      { id: roleCourierId, tenantId: tenantAId, name: 'COURIER' },
    ],
  });

  await admin.userRole.createMany({
    data: [
      { tenantId: tenantAId, userId: userCoordAId, roleId: roleCoordId },
      { tenantId: tenantAId, userId: courierUser1Id, roleId: roleCourierId },
      { tenantId: tenantAId, userId: courierUser2Id, roleId: roleCourierId },
    ],
  });

  // 3. Couriers
  await admin.courier.createMany({
    data: [
      {
        id: courier1Id,
        tenantId: tenantAId,
        userId: courierUser1Id,
        status: 'ACTIVE',
      },
      {
        id: courier2Id,
        tenantId: tenantAId,
        userId: courierUser2Id,
        status: 'ACTIVE',
      },
      {
        id: courierBId,
        tenantId: tenantBId,
        userId: courierUserBId,
        status: 'ACTIVE',
      },
    ],
  });

  // 4. Vehicles
  await admin.vehicle.createMany({
    data: [
      {
        id: vehicle1Id,
        tenantId: tenantAId,
        plate: `V1-${vehicle1Id.slice(0, 4)}`,
        maxWeightKg: 1000,
        maxVolumeM3: 10,
        status: 'ACTIVE',
      },
      {
        id: vehicleBId,
        tenantId: tenantBId,
        plate: `VB-${vehicleBId.slice(0, 4)}`,
        maxWeightKg: 1000,
        maxVolumeM3: 10,
        status: 'ACTIVE',
      },
    ],
  });

  // 5. Zones & Shipment Types
  await admin.zone.createMany({
    data: [
      {
        id: zoneAId,
        tenantId: tenantAId,
        code: `ZN-A-${zoneAId.slice(0, 4)}`,
        name: 'Zona Norte A',
      },
      {
        id: zoneBId,
        tenantId: tenantBId,
        code: `ZN-B-${zoneBId.slice(0, 4)}`,
        name: 'Zona Norte B',
      },
    ],
  });

  await admin.shipmentType.createMany({
    data: [
      {
        id: shipmentTypeAId,
        tenantId: tenantAId,
        code: `ST-A-${shipmentTypeAId.slice(0, 4)}`,
        name: 'Standard A',
      },
      {
        id: shipmentTypeBId,
        tenantId: tenantBId,
        code: `ST-B-${shipmentTypeBId.slice(0, 4)}`,
        name: 'Standard B',
      },
    ],
  });

  // 6. Depots
  await admin.$executeRaw`
    INSERT INTO "Depot" ("id", "tenantId", "name", "location", "timeZone", "openingHours")
    VALUES 
    (
      ${depotAId}::uuid,
      ${tenantAId}::uuid,
      'Depósito Central A',
      ST_SetSRID(ST_MakePoint(-74.8000, 11.0000), 4326),
      'America/Bogota',
      '{}'::jsonb
    ),
    (
      ${depotBId}::uuid,
      ${tenantBId}::uuid,
      'Depósito Central B',
      ST_SetSRID(ST_MakePoint(-74.8050, 11.0050), 4326),
      'America/Bogota',
      '{}'::jsonb
    )
  `;

  // 7. Addresses
  await admin.address.createMany({
    data: [
      {
        id: addressAId,
        tenantId: tenantAId,
        originalText: 'Calle 80 # 50-10, Barranquilla',
        municipalityCode: '08001',
      },
      {
        id: addressBId,
        tenantId: tenantBId,
        originalText: 'Carrera 43 # 70-20, Barranquilla',
        municipalityCode: '08001',
      },
    ],
  });

  return {
    tenantAId,
    tenantBId,
    userCoordAId,
    courierUser1Id,
    courierUser2Id,
    courierUserBId,
    unauthorizedUserAId,
    courier1Id,
    courier2Id,
    courierBId,
    vehicle1Id,
    vehicleBId,
    zoneAId,
    zoneBId,
    depotAId,
    depotBId,
    shipmentTypeAId,
    shipmentTypeBId,
    addressAId,
    addressBId,
  };
}

export interface DeliveryRouteFixture {
  planningRequestId: string;
  routeId: string;
  stop1Id: string;
  stop2Id: string;
  stop3Id: string;
  pkg1Id: string;
  pkg2Id: string;
  pkg3Id: string;
  pkg4Id: string;
  assignment1Id: string;
  assignment2Id: string;
  assignment3Id: string;
  assignment4Id: string;
}

export async function createDeliveryRouteWithMultiPackageStops(
  admin: PrismaClient,
  env: DeliveryLifecycleEnvironment,
): Promise<DeliveryRouteFixture> {
  const routeId = randomUUID();
  const planningRequestId = randomUUID();

  // 1. Planning Request
  await admin.routePlanningRequest.create({
    data: {
      id: planningRequestId,
      tenantId: env.tenantAId,
      requestedByUserId: env.userCoordAId,
      status: 'COMPLETED',
      parameters: {},
      resultSnapshot: { routeIds: [routeId] },
    },
  });

  // 2. Route IN_PROGRESS
  await admin.route.create({
    data: {
      id: routeId,
      tenantId: env.tenantAId,
      planningRequestId,
      vehicleId: env.vehicle1Id,
      courierId: env.courier1Id,
      depotId: env.depotAId,
      state: 'IN_PROGRESS',
      plannedStartAt: new Date('2026-10-06T08:00:00.000Z'),
      plannedEndAt: new Date('2026-10-06T18:00:00.000Z'),
      startedAt: new Date('2026-10-06T08:15:00.000Z'),
      serviceDate: new Date('2026-10-06T00:00:00.000Z'),
    },
  });

  const stop1Id = randomUUID();
  const stop2Id = randomUUID();
  const stop3Id = randomUUID();

  // 3. RouteStops (3 stops, stop 2 is multi-package)
  await admin.routeStop.createMany({
    data: [
      {
        id: stop1Id,
        tenantId: env.tenantAId,
        routeId,
        sequence: 1,
        latitude: 11.01,
        longitude: -74.81,
        state: 'PENDING',
      },
      {
        id: stop2Id,
        tenantId: env.tenantAId,
        routeId,
        sequence: 2,
        latitude: 11.02,
        longitude: -74.82,
        state: 'PENDING',
      },
      {
        id: stop3Id,
        tenantId: env.tenantAId,
        routeId,
        sequence: 3,
        latitude: 11.03,
        longitude: -74.83,
        state: 'PENDING',
      },
    ],
  });

  // 4. Packages:
  // pkg1 -> stop1
  // pkg2, pkg3 -> stop2 (multi-package stop)
  // pkg4 -> stop3
  const pkg1Id = randomUUID();
  const pkg2Id = randomUUID();
  const pkg3Id = randomUUID();
  const pkg4Id = randomUUID();

  const packagesData = [
    {
      id: pkg1Id,
      trackingNumber: `TRK-${pkg1Id.slice(0, 8)}`,
      weightKg: 2.5,
      volumeM3: 0.01,
    },
    {
      id: pkg2Id,
      trackingNumber: `TRK-${pkg2Id.slice(0, 8)}`,
      weightKg: 1.0,
      volumeM3: 0.005,
    },
    {
      id: pkg3Id,
      trackingNumber: `TRK-${pkg3Id.slice(0, 8)}`,
      weightKg: 3.0,
      volumeM3: 0.015,
    },
    {
      id: pkg4Id,
      trackingNumber: `TRK-${pkg4Id.slice(0, 8)}`,
      weightKg: 5.0,
      volumeM3: 0.02,
    },
  ];

  for (const pkg of packagesData) {
    await admin.package.create({
      data: {
        id: pkg.id,
        tenantId: env.tenantAId,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
        zoneId: env.zoneAId,
        trackingCode: `TRK-${pkg.id.slice(0, 8)}`,
        publicTrackingToken: `tok-${pkg.id}`,
        state: 'IN_TRANSIT',
        weightKg: pkg.weightKg,
        lengthCm: 20,
        widthCm: 15,
        heightCm: 10,
        volumeM3: 0.003,
        priority: 'NORMAL',
      },
    });
  }

  // 5. Active Assignments
  const assignment1Id = randomUUID();
  const assignment2Id = randomUUID();
  const assignment3Id = randomUUID();
  const assignment4Id = randomUUID();

  await admin.assignment.createMany({
    data: [
      {
        id: assignment1Id,
        tenantId: env.tenantAId,
        packageId: pkg1Id,
        routeId,
        routeStopId: stop1Id,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        responsibleUserId: env.userCoordAId,
        assignmentType: 'INITIAL',
        status: 'ACTIVE',
      },
      {
        id: assignment2Id,
        tenantId: env.tenantAId,
        packageId: pkg2Id,
        routeId,
        routeStopId: stop2Id,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        responsibleUserId: env.userCoordAId,
        assignmentType: 'INITIAL',
        status: 'ACTIVE',
      },
      {
        id: assignment3Id,
        tenantId: env.tenantAId,
        packageId: pkg3Id,
        routeId,
        routeStopId: stop2Id,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        responsibleUserId: env.userCoordAId,
        assignmentType: 'INITIAL',
        status: 'ACTIVE',
      },
      {
        id: assignment4Id,
        tenantId: env.tenantAId,
        packageId: pkg4Id,
        routeId,
        routeStopId: stop3Id,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        responsibleUserId: env.userCoordAId,
        assignmentType: 'INITIAL',
        status: 'ACTIVE',
      },
    ],
  });

  return {
    planningRequestId,
    routeId,
    stop1Id,
    stop2Id,
    stop3Id,
    pkg1Id,
    pkg2Id,
    pkg3Id,
    pkg4Id,
    assignment1Id,
    assignment2Id,
    assignment3Id,
    assignment4Id,
  };
}

export async function cleanDeliveryLifecycleEnvironment(
  admin: PrismaClient,
  tenantIds: string[],
): Promise<void> {
  try {
    await admin.deliveryEvidence.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.deliveryAttempt.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.deliveryOperation.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.deliveryWindow.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.incident.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.outboxEvent.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.auditLog.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.assignment.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.routeStop.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.route.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.routePlanningRequest.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.package.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.depot.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.address.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.zone.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.shipmentType.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.courier.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.vehicle.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.userRole.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.role.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.user.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.tenant.deleteMany({
      where: { id: { in: tenantIds } },
    });
  } catch {
    // Ignored during cleanup
  }
}
