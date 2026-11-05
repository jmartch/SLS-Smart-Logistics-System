import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';

export interface RouteLifecycleEnvironment {
  tenantAId: string;
  tenantBId: string;
  userCoordAId: string;
  courierUser1Id: string;
  courierUser2Id: string;
  courierUserBId: string;
  courier1Id: string;
  courier2Id: string;
  courierBId: string;
  vehicle1Id: string;
  vehicleMaintId: string;
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

export async function seedRouteLifecycleEnvironment(
  admin: PrismaClient,
): Promise<RouteLifecycleEnvironment> {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const userCoordAId = randomUUID();
  const courierUser1Id = randomUUID();
  const courierUser2Id = randomUUID();
  const courierUserBId = randomUUID();

  const courier1Id = randomUUID();
  const courier2Id = randomUUID();
  const courierBId = randomUUID();

  const vehicle1Id = randomUUID();
  const vehicleMaintId = randomUUID();
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
        slug: `route-01-a-${tenantAId}`,
        status: 'ACTIVE',
      },
      {
        id: tenantBId,
        name: `Tenant B ${tenantBId}`,
        slug: `route-01-b-${tenantBId}`,
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
    ],
  });

  // 2.1 Role and UserRole for Coordinator
  const roleCoordId = randomUUID();
  await admin.role.create({
    data: {
      id: roleCoordId,
      tenantId: tenantAId,
      name: 'COORDINATOR',
    },
  });

  await admin.userRole.create({
    data: {
      tenantId: tenantAId,
      userId: userCoordAId,
      roleId: roleCoordId,
    },
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
        status: 'INACTIVE',
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
        id: vehicleMaintId,
        tenantId: tenantAId,
        plate: `VM-${vehicleMaintId.slice(0, 4)}`,
        maxWeightKg: 1000,
        maxVolumeM3: 10,
        status: 'MAINTENANCE',
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
    courier1Id,
    courier2Id,
    courierBId,
    vehicle1Id,
    vehicleMaintId,
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

export interface CreateRouteOptions {
  tenantId: string;
  requestedByUserId: string;
  vehicleId: string;
  courierId: string;
  depotId?: string | null;
  state?:
    | 'PLANNED'
    | 'READY'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'INTERRUPTED';
  addressId: string;
  shipmentTypeId: string;
  zoneId?: string | null;
  stopCount?: number;
  packageState?:
    | 'ASSIGNED_TO_ROUTE'
    | 'READY_FOR_DISPATCH'
    | 'IN_TRANSIT'
    | 'PENDING_ASSIGNMENT';
  startedAt?: Date | null;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  serviceDate?: Date | null;
}

export interface CreatedRouteFixture {
  planningRequestId: string;
  routeId: string;
  stopIds: string[];
  packageIds: string[];
  assignmentIds: string[];
}

export async function createRouteWithStopsAndPackages(
  admin: PrismaClient,
  options: CreateRouteOptions,
): Promise<CreatedRouteFixture> {
  const routeId = randomUUID();
  const planningRequestId = randomUUID();
  const state = options.state ?? 'PLANNED';
  const stopCount = options.stopCount ?? 2;
  const defaultPackageState =
    options.packageState ??
    (state === 'READY'
      ? 'READY_FOR_DISPATCH'
      : state === 'IN_PROGRESS'
        ? 'IN_TRANSIT'
        : 'ASSIGNED_TO_ROUTE');

  // 1. Planning Request
  await admin.routePlanningRequest.create({
    data: {
      id: planningRequestId,
      tenantId: options.tenantId,
      requestedByUserId: options.requestedByUserId,
      status: 'COMPLETED',
      parameters: {},
      resultSnapshot: {
        routeIds: [routeId],
      },
    },
  });

  // 2. Route
  await admin.route.create({
    data: {
      id: routeId,
      tenantId: options.tenantId,
      planningRequestId,
      vehicleId: options.vehicleId,
      courierId: options.courierId,
      depotId: options.depotId ?? null,
      state,
      plannedStartAt:
        options.plannedStartAt ?? new Date('2026-10-06T08:00:00.000Z'),
      plannedEndAt:
        options.plannedEndAt ?? new Date('2026-10-06T18:00:00.000Z'),
      startedAt: options.startedAt ?? null,
      serviceDate: options.serviceDate ?? null,
    },
  });

  const stopIds: string[] = [];
  const packageIds: string[] = [];
  const assignmentIds: string[] = [];

  for (let seq = 1; seq <= stopCount; seq++) {
    const stopId = randomUUID();
    const packageId = randomUUID();
    const assignmentId = randomUUID();

    // Stop
    await admin.routeStop.create({
      data: {
        id: stopId,
        tenantId: options.tenantId,
        routeId,
        sequence: seq,
        latitude: 11.0 + seq * 0.001,
        longitude: -74.8 - seq * 0.001,
        state: 'PENDING',
      },
    });

    // Package
    await admin.package.create({
      data: {
        id: packageId,
        tenantId: options.tenantId,
        addressId: options.addressId,
        shipmentTypeId: options.shipmentTypeId,
        zoneId: options.zoneId ?? null,
        trackingCode: `TRK-${packageId.slice(0, 8)}`,
        publicTrackingToken: `tok-${packageId}`,
        state: defaultPackageState,
        weightKg: 5,
        lengthCm: 20,
        widthCm: 15,
        heightCm: 10,
        volumeM3: 0.003,
        priority: 'NORMAL',
      },
    });

    // Assignment
    await admin.assignment.create({
      data: {
        id: assignmentId,
        tenantId: options.tenantId,
        packageId,
        routeId,
        routeStopId: stopId,
        vehicleId: options.vehicleId,
        courierId: options.courierId,
        responsibleUserId: options.requestedByUserId,
        assignmentType: 'INITIAL',
        status: 'ACTIVE',
      },
    });

    stopIds.push(stopId);
    packageIds.push(packageId);
    assignmentIds.push(assignmentId);
  }

  return {
    planningRequestId,
    routeId,
    stopIds,
    packageIds,
    assignmentIds,
  };
}

export async function cleanRouteLifecycleEnvironment(
  admin: PrismaClient,
  tenantIds: string[],
): Promise<void> {
  try {
    await admin.outboxEvent.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.assignment.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.routeStop.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.route.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.routePlanningRequest.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.package.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.depot.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.address.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.zone.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.shipmentType.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await admin.courier.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.userRole.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.role.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await admin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  } catch {
    // Ignored during cleanup
  }
}
