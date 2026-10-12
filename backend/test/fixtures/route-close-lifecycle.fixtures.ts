import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';

export interface RouteCloseEnvironment {
  tenantAId: string;
  tenantBId: string;
  userCoordAId: string;
  userCoordBId: string;
  courierUser1Id: string;
  courierUser2Id: string;
  courierUserBId: string;
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

export async function seedRouteCloseEnvironment(
  admin: PrismaClient,
): Promise<RouteCloseEnvironment> {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userCoordAId = randomUUID();
  const userCoordBId = randomUUID();
  const courierUser1Id = randomUUID();
  const courierUser2Id = randomUUID();
  const courierUserBId = randomUUID();

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
        name: `Tenant A ${tenantAId.slice(0, 8)}`,
        slug: `route-close-01-a-${tenantAId}`,
        status: 'ACTIVE',
      },
      {
        id: tenantBId,
        name: `Tenant B ${tenantBId.slice(0, 8)}`,
        slug: `route-close-01-b-${tenantBId}`,
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
        id: userCoordBId,
        tenantId: tenantBId,
        email: `coord_${userCoordBId.slice(0, 8)}@tenantb.com`,
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
    ],
  });

  // 2.1 Roles
  const roleCoordAId = randomUUID();
  const roleCoordBId = randomUUID();
  await admin.role.createMany({
    data: [
      { id: roleCoordAId, tenantId: tenantAId, name: 'COORDINATOR' },
      { id: roleCoordBId, tenantId: tenantBId, name: 'COORDINATOR' },
    ],
  });

  await admin.userRole.createMany({
    data: [
      { tenantId: tenantAId, userId: userCoordAId, roleId: roleCoordAId },
      { tenantId: tenantBId, userId: userCoordBId, roleId: roleCoordBId },
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
    userCoordBId,
    courierUser1Id,
    courierUser2Id,
    courierUserBId,
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

export interface RouteCloseFixture {
  planningRequestId: string;
  routeId: string;
  stopIds: string[];
  packageIds: string[];
  assignmentIds: string[];
}

export async function createAllDeliveredRegularRoute(
  admin: PrismaClient,
  env: RouteCloseEnvironment,
): Promise<RouteCloseFixture> {
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

  const now = Date.now();
  const plannedStartAt = new Date(now - 7200 * 1000);
  const plannedEndAt = new Date(now + 3600 * 1000);
  const startedAt = new Date(now - 3600 * 1000);

  // 2. Route in IN_PROGRESS
  await admin.route.create({
    data: {
      id: routeId,
      tenantId: env.tenantAId,
      planningRequestId,
      vehicleId: env.vehicle1Id,
      courierId: env.courier1Id,
      depotId: env.depotAId,
      state: 'IN_PROGRESS',
      plannedDistanceM: 5200,
      plannedDurationS: 1800,
      plannedStartAt,
      plannedEndAt,
      startedAt,
      serviceDate: null,
    },
  });

  const stopIds: string[] = [];
  const packageIds: string[] = [];
  const assignmentIds: string[] = [];

  // 3 stops, 1 package each, all delivered
  for (let i = 1; i <= 3; i++) {
    const stopId = randomUUID();
    const pkgId = randomUUID();
    const asgId = randomUUID();

    stopIds.push(stopId);
    packageIds.push(pkgId);
    assignmentIds.push(asgId);

    const arrivalAt = new Date(now - 1800 * 1000 + i * 60000);
    const serviceStartAt = new Date(now - 1800 * 1000 + i * 60000 + 1000);
    const serviceEndAt = new Date(now - 1800 * 1000 + i * 60000 + 30000);

    await admin.routeStop.create({
      data: {
        id: stopId,
        tenantId: env.tenantAId,
        routeId,
        sequence: i,
        latitude: 11.0 + i * 0.002,
        longitude: -74.8 - i * 0.002,
        state: 'COMPLETED',
        arrivalAt,
        serviceStartAt,
        serviceEndAt,
      },
    });

    await admin.package.create({
      data: {
        id: pkgId,
        tenantId: env.tenantAId,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
        zoneId: env.zoneAId,
        trackingCode: `TRK-REG-${pkgId.slice(0, 6)}`,
        publicTrackingToken: `tok-${pkgId.slice(0, 8)}`,
        state: 'DELIVERED',
        weightKg: 3.5,
        lengthCm: 20,
        widthCm: 15,
        heightCm: 10,
        volumeM3: 0.003,
        priority: 'NORMAL',
      },
    });

    await admin.assignment.create({
      data: {
        id: asgId,
        tenantId: env.tenantAId,
        packageId: pkgId,
        routeId,
        routeStopId: stopId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        responsibleUserId: env.userCoordAId,
        assignmentType: 'INITIAL',
        status: 'ENDED',
        endedAt: serviceEndAt,
        reasonCode: 'DELIVERED',
        routeOutcome: 'DELIVERED',
      },
    });
  }

  return {
    planningRequestId,
    routeId,
    stopIds,
    packageIds,
    assignmentIds,
  };
}

export interface SevenPackagesForcedRouteFixture extends RouteCloseFixture {
  deliveredPkgIds: string[];
  failedPkgId: string;
  rescheduledPkgId: string;
  returnedPkgId: string;
  pendingPkgIds: string[];
  unresolvedAssignmentIds: string[];
}

export async function createSevenPackagesForcedRoute(
  admin: PrismaClient,
  env: RouteCloseEnvironment,
): Promise<SevenPackagesForcedRouteFixture> {
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

  const now = Date.now();
  const plannedStartAt = new Date(now - 10800 * 1000);
  const plannedEndAt = new Date(now + 3600 * 1000);
  const startedAt = new Date(now - 7200 * 1000);

  // 2. Route in INTERRUPTED
  await admin.route.create({
    data: {
      id: routeId,
      tenantId: env.tenantAId,
      planningRequestId,
      vehicleId: env.vehicle1Id,
      courierId: env.courier1Id,
      depotId: env.depotAId,
      state: 'INTERRUPTED',
      plannedDistanceM: 12500,
      plannedDurationS: 4500,
      plannedStartAt,
      plannedEndAt,
      startedAt,
      serviceDate: null,
    },
  });

  const stopIds: string[] = [];
  const packageIds: string[] = [];
  const assignmentIds: string[] = [];

  // Stop 1: 2 packages -> DELIVERED (COMPLETED stop)
  const stop1Id = randomUUID();
  stopIds.push(stop1Id);
  await admin.routeStop.create({
    data: {
      id: stop1Id,
      tenantId: env.tenantAId,
      routeId,
      sequence: 1,
      latitude: 11.01,
      longitude: -74.81,
      state: 'COMPLETED',
    },
  });

  const pkg1Id = randomUUID();
  const pkg2Id = randomUUID();
  const asg1Id = randomUUID();
  const asg2Id = randomUUID();
  packageIds.push(pkg1Id, pkg2Id);
  assignmentIds.push(asg1Id, asg2Id);

  for (const [pId, aId] of [[pkg1Id, asg1Id], [pkg2Id, asg2Id]]) {
    await admin.package.create({
      data: {
        id: pId,
        tenantId: env.tenantAId,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
        trackingCode: `TRK-DEL-${pId.slice(0, 6)}`,
        publicTrackingToken: `tok-${pId.slice(0, 8)}`,
        state: 'DELIVERED',
        weightKg: 2,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        volumeM3: 0.001,
        priority: 'NORMAL',
      },
    });
    await admin.assignment.create({
      data: {
        id: aId,
        tenantId: env.tenantAId,
        packageId: pId,
        routeId,
        routeStopId: stop1Id,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        responsibleUserId: env.userCoordAId,
        assignmentType: 'INITIAL',
        status: 'ENDED',
        endedAt: new Date(now - 5400 * 1000),
        reasonCode: 'DELIVERED',
        routeOutcome: 'DELIVERED',
      },
    });
  }

  // Stop 2: 1 package -> FAILED attempt (FAILED stop, package DELIVERY_FAILED, custody in vehicle)
  const stop2Id = randomUUID();
  const pkg3Id = randomUUID();
  const asg3Id = randomUUID();
  stopIds.push(stop2Id);
  packageIds.push(pkg3Id);
  assignmentIds.push(asg3Id);

  await admin.routeStop.create({
    data: {
      id: stop2Id,
      tenantId: env.tenantAId,
      routeId,
      sequence: 2,
      latitude: 11.02,
      longitude: -74.82,
      state: 'FAILED',
    },
  });

  await admin.package.create({
    data: {
      id: pkg3Id,
      tenantId: env.tenantAId,
      addressId: env.addressAId,
      shipmentTypeId: env.shipmentTypeAId,
      trackingCode: `TRK-FAIL-${pkg3Id.slice(0, 6)}`,
      publicTrackingToken: `tok-${pkg3Id.slice(0, 8)}`,
      state: 'DELIVERY_FAILED',
      weightKg: 2,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      volumeM3: 0.001,
      priority: 'NORMAL',
    },
  });

  await admin.assignment.create({
    data: {
      id: asg3Id,
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
  });

  await admin.deliveryAttempt.create({
    data: {
      id: randomUUID(),
      tenantId: env.tenantAId,
      courierId: env.courier1Id,
      routeId,
      routeStopId: stop2Id,
      packageId: pkg3Id,
      assignmentId: asg3Id,
      attemptNumber: 1,
      outcome: 'FAILED',
      failureReasonCode: 'RECIPIENT_NOT_HOME',
      attemptedAt: new Date(now - 3600 * 1000),
    },
  });

  // Stop 3: 2 packages -> 1 RESCHEDULED, 1 RETURNED (FAILED stop, custody in vehicle)
  const stop3Id = randomUUID();
  const pkg4Id = randomUUID();
  const pkg5Id = randomUUID();
  const asg4Id = randomUUID();
  const asg5Id = randomUUID();
  stopIds.push(stop3Id);
  packageIds.push(pkg4Id, pkg5Id);
  assignmentIds.push(asg4Id, asg5Id);

  await admin.routeStop.create({
    data: {
      id: stop3Id,
      tenantId: env.tenantAId,
      routeId,
      sequence: 3,
      latitude: 11.03,
      longitude: -74.83,
      state: 'FAILED',
    },
  });

  // pkg4: RESCHEDULED
  await admin.package.create({
    data: {
      id: pkg4Id,
      tenantId: env.tenantAId,
      addressId: env.addressAId,
      shipmentTypeId: env.shipmentTypeAId,
      trackingCode: `TRK-RESCH-${pkg4Id.slice(0, 6)}`,
      publicTrackingToken: `tok-${pkg4Id.slice(0, 8)}`,
      state: 'RESCHEDULED',
      weightKg: 2,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      volumeM3: 0.001,
      priority: 'NORMAL',
    },
  });
  await admin.assignment.create({
    data: {
      id: asg4Id,
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
  });
  await admin.deliveryAttempt.create({
    data: {
      id: randomUUID(),
      tenantId: env.tenantAId,
      courierId: env.courier1Id,
      routeId,
      routeStopId: stop3Id,
      packageId: pkg4Id,
      assignmentId: asg4Id,
      attemptNumber: 1,
      outcome: 'FAILED',
      failureReasonCode: 'RESCHEDULE_REQUESTED',
      attemptedAt: new Date(now - 2400 * 1000),
    },
  });

  // pkg5: RETURN_PENDING
  await admin.package.create({
    data: {
      id: pkg5Id,
      tenantId: env.tenantAId,
      addressId: env.addressAId,
      shipmentTypeId: env.shipmentTypeAId,
      trackingCode: `TRK-RET-${pkg5Id.slice(0, 6)}`,
      publicTrackingToken: `tok-${pkg5Id.slice(0, 8)}`,
      state: 'RETURN_PENDING',
      weightKg: 2,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      volumeM3: 0.001,
      priority: 'NORMAL',
    },
  });
  await admin.assignment.create({
    data: {
      id: asg5Id,
      tenantId: env.tenantAId,
      packageId: pkg5Id,
      routeId,
      routeStopId: stop3Id,
      vehicleId: env.vehicle1Id,
      courierId: env.courier1Id,
      responsibleUserId: env.userCoordAId,
      assignmentType: 'INITIAL',
      status: 'ACTIVE',
    },
  });
  await admin.deliveryAttempt.create({
    data: {
      id: randomUUID(),
      tenantId: env.tenantAId,
      courierId: env.courier1Id,
      routeId,
      routeStopId: stop3Id,
      packageId: pkg5Id,
      assignmentId: asg5Id,
      attemptNumber: 1,
      outcome: 'FAILED',
      failureReasonCode: 'REJECTED_BY_RECIPIENT',
      attemptedAt: new Date(now - 1800 * 1000),
    },
  });

  // Stop 4: 2 packages -> PENDING (never visited, package IN_TRANSIT, assignment ACTIVE)
  const stop4Id = randomUUID();
  const pkg6Id = randomUUID();
  const pkg7Id = randomUUID();
  const asg6Id = randomUUID();
  const asg7Id = randomUUID();
  stopIds.push(stop4Id);
  packageIds.push(pkg6Id, pkg7Id);
  assignmentIds.push(asg6Id, asg7Id);

  await admin.routeStop.create({
    data: {
      id: stop4Id,
      tenantId: env.tenantAId,
      routeId,
      sequence: 4,
      latitude: 11.04,
      longitude: -74.84,
      state: 'PENDING',
    },
  });

  for (const [pId, aId] of [[pkg6Id, asg6Id], [pkg7Id, asg7Id]]) {
    await admin.package.create({
      data: {
        id: pId,
        tenantId: env.tenantAId,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
        trackingCode: `TRK-PEND-${pId.slice(0, 6)}`,
        publicTrackingToken: `tok-${pId.slice(0, 8)}`,
        state: 'IN_TRANSIT',
        weightKg: 2,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        volumeM3: 0.001,
        priority: 'NORMAL',
      },
    });
    await admin.assignment.create({
      data: {
        id: aId,
        tenantId: env.tenantAId,
        packageId: pId,
        routeId,
        routeStopId: stop4Id,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        responsibleUserId: env.userCoordAId,
        assignmentType: 'INITIAL',
        status: 'ACTIVE',
      },
    });
  }

  return {
    planningRequestId,
    routeId,
    stopIds,
    packageIds,
    assignmentIds,
    deliveredPkgIds: [pkg1Id, pkg2Id],
    failedPkgId: pkg3Id,
    rescheduledPkgId: pkg4Id,
    returnedPkgId: pkg5Id,
    pendingPkgIds: [pkg6Id, pkg7Id],
    unresolvedAssignmentIds: [asg3Id, asg4Id, asg5Id, asg6Id, asg7Id],
  };
}

export async function cleanRouteCloseEnvironment(
  admin: PrismaClient,
  tenantIds: string[],
): Promise<void> {
  try {
    await admin.routeClosure.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.deliveryAttempt.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.deliveryEvidence.deleteMany({
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
    await admin.packageStatusHistory.deleteMany({
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
