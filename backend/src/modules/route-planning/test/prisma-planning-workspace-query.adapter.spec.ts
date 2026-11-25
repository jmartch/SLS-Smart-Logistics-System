import { Prisma } from '../../../../generated/prisma/client';
import type { PrismaService } from '../../../database/prisma.service';
import { PrismaPlanningWorkspaceQueryAdapter } from '../infrastructure/prisma-planning-workspace-query.adapter';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const ZONE_A = '20000000-0000-4000-8000-000000000001';
const DEPOT_A = '30000000-0000-4000-8000-000000000001';
const DATASET_A = '40000000-0000-4000-8000-000000000001';
const VEHICLE_1 = '50000000-0000-4000-8000-000000000001';
const VEHICLE_2 = '50000000-0000-4000-8000-000000000002';
const COURIER_1 = '60000000-0000-4000-8000-000000000001';
const ROUTE_PLANNED = '70000000-0000-4000-8000-000000000001';
const PKG_1 = '80000000-0000-4000-8000-000000000001';

describe('PrismaPlanningWorkspaceQueryAdapter', () => {
  describe('getWorkspace', () => {
    it.each([
      ['demo tenant without a catalog', TENANT_A, false, 0],
      [
        'another tenant without a catalog',
        '10000000-0000-4000-8000-000000000002',
        false,
        0,
      ],
      ['demo tenant with a catalog', TENANT_A, true, 1],
      [
        'another tenant with a catalog',
        '10000000-0000-4000-8000-000000000002',
        true,
        1,
      ],
    ] as const)(
      'returns unresolved coordinates without writes for %s',
      async (_, tenantId, hasCatalog, expectedDatasetCount) => {
        // Arrange
        const tx = {
          $executeRaw: jest
            .fn<Promise<number>, [TemplateStringsArray, ...unknown[]]>()
            .mockResolvedValue(1),
          $queryRaw: jest.fn().mockResolvedValue([]),
          zone: { findMany: jest.fn().mockResolvedValue([]) },
          geoDataset: {
            findMany: jest.fn().mockResolvedValue(
              hasCatalog
                ? [
                    {
                      id: DATASET_A,
                      name: 'Published test catalog',
                      sourceType: 'SYNTHETIC',
                      coverage: 'Barranquilla',
                      readyAt: new Date('2026-10-01T00:00:00.000Z'),
                    },
                  ]
                : [],
            ),
            upsert: jest.fn(),
          },
          geocodingAttempt: { create: jest.fn(), update: jest.fn() },
          vehicle: { findMany: jest.fn().mockResolvedValue([]) },
          courier: { findMany: jest.fn().mockResolvedValue([]) },
          route: { findMany: jest.fn().mockResolvedValue([]) },
          package: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: PKG_1,
                trackingCode: 'PKG-UNRESOLVED',
                state: 'CLASSIFIED',
                priority: 'NORMAL',
                zoneId: null,
                sectorId: null,
                weightKg: new Prisma.Decimal('1'),
                volumeM3: new Prisma.Decimal('0.01'),
                address: { originalText: 'Unresolved address' },
                geocodingAttempt: null,
              },
            ]),
            update: jest.fn(),
          },
        };
        const prisma = {
          $transaction: jest.fn((cb: (client: unknown) => unknown) =>
            Promise.resolve(cb(tx)),
          ),
        } as unknown as PrismaService;
        const adapter = new PrismaPlanningWorkspaceQueryAdapter(prisma);

        // Act
        const result = await adapter.getWorkspace({ tenantId });

        // Assert
        expect(result.datasets).toHaveLength(expectedDatasetCount);
        expect(result.candidatePackages[0].hasReadyCoordinates).toBe(false);
        const tenantFilter: unknown = expect.objectContaining({ tenantId });
        expect(tx.package.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: tenantFilter,
          }),
        );
        expect(tx.geoDataset.upsert).not.toHaveBeenCalled();
        expect(tx.geocodingAttempt.create).not.toHaveBeenCalled();
        expect(tx.geocodingAttempt.update).not.toHaveBeenCalled();
        expect(tx.package.update).not.toHaveBeenCalled();
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
        expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain(
          "set_config('app.tenant_id'",
        );
      },
    );
  });

  it('loads only tenant-scoped ACTIVE resources, computes window eligibility, and returns PLANNED editable routes with remaining capacity', async () => {
    const tx = {
      $executeRaw: jest
        .fn<Promise<number>, [TemplateStringsArray, ...unknown[]]>()
        .mockResolvedValue(1),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: DEPOT_A,
            name: 'Bodega Norte',
            timeZone: 'America/Bogota',
            latitude: 10.9878,
            longitude: -74.7889,
          },
        ])
        .mockResolvedValueOnce([
          {
            vehicleId: VEHICLE_1,
            totalWeight: '15.500',
            totalVolume: '0.120000',
          },
        ]),
      zone: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: ZONE_A, code: 'ZN-N', name: 'Zona Norte' },
          ]),
      },
      geoDataset: {
        upsert: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: DATASET_A,
            name: 'Barranquilla Road Graph',
            sourceType: 'OSM',
            coverage: 'Barranquilla',
            readyAt: new Date('2026-10-01T00:00:00.000Z'),
          },
        ]),
      },
      geocodingAttempt: { create: jest.fn(), update: jest.fn() },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: VEHICLE_1,
            tenantId: TENANT_A,
            plate: 'BAQ-101',
            status: 'ACTIVE',
            maxWeightKg: new Prisma.Decimal('100.000'),
            maxVolumeM3: new Prisma.Decimal('1.000000'),
          },
          {
            id: VEHICLE_2,
            tenantId: TENANT_A,
            plate: 'BAQ-102',
            status: 'ACTIVE',
            maxWeightKg: new Prisma.Decimal('80.000'),
            maxVolumeM3: new Prisma.Decimal('0.800000'),
          },
        ]),
      },
      vehicleShift: {
        findMany: jest.fn().mockResolvedValue([{ vehicleId: VEHICLE_1 }]),
      },
      route: {
        findMany: jest
          .fn()
          // 1) vehicleOccupiedSet
          .mockResolvedValueOnce([])
          // 2) courierOccupiedSet
          .mockResolvedValueOnce([])
          // 3) dbPlannedRoutes
          .mockResolvedValueOnce([
            {
              id: ROUTE_PLANNED,
              tenantId: TENANT_A,
              state: 'PLANNED',
              vehicleId: VEHICLE_1,
              courierId: COURIER_1,
              depotId: DEPOT_A,
              plannedStartAt: new Date('2026-10-12T08:00:00.000Z'),
              plannedEndAt: new Date('2026-10-12T13:00:00.000Z'),
              vehicle: {
                id: VEHICLE_1,
                plate: 'BAQ-101',
                maxWeightKg: new Prisma.Decimal('100.000'),
                maxVolumeM3: new Prisma.Decimal('1.000000'),
              },
              courier: {
                id: COURIER_1,
                user: { email: 'courier1@demo.co' },
              },
              _count: { stops: 2 },
              assignments: [
                {
                  package: {
                    weightKg: new Prisma.Decimal('15.500'),
                    volumeM3: new Prisma.Decimal('0.120000'),
                  },
                },
              ],
            },
          ]),
      },
      courier: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: COURIER_1,
            tenantId: TENANT_A,
            userId: '90000000-0000-4000-8000-000000000001',
            status: 'ACTIVE',
            user: { email: 'courier1@demo.co' },
          },
        ]),
      },
      courierShift: {
        findMany: jest.fn().mockResolvedValue([{ courierId: COURIER_1 }]),
      },
      package: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: PKG_1,
            tenantId: TENANT_A,
            trackingCode: 'PKG-0100',
            state: 'CLASSIFIED',
            priority: 'HIGH',
            zoneId: ZONE_A,
            sectorId: null,
            weightKg: new Prisma.Decimal('4.250'),
            volumeM3: new Prisma.Decimal('0.015000'),
            address: { originalText: 'Cra 53 # 82-10' },
            zone: { name: 'Zona Norte' },
            sector: null,
            geocodingAttempt: {
              status: 'MATCHED',
              selectedCandidateId: '99000000-0000-4000-8000-000000000001',
              dataset: { status: 'READY' },
            },
          },
        ]),
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (client: unknown) => unknown) =>
        Promise.resolve(cb(tx)),
      ),
    } as unknown as PrismaService;

    const adapter = new PrismaPlanningWorkspaceQueryAdapter(prisma);

    const result = await adapter.getWorkspace({
      tenantId: TENANT_A,
      zoneId: ZONE_A,
      window: {
        startAt: '2026-10-12T08:00:00.000Z',
        endAt: '2026-10-12T13:00:00.000Z',
      },
    });

    expect(tx.geoDataset.upsert).not.toHaveBeenCalled();
    expect(tx.geocodingAttempt.create).not.toHaveBeenCalled();
    expect(tx.geocodingAttempt.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.vehicleShift.findMany).not.toHaveBeenCalled();
    expect(tx.courierShift.findMany).not.toHaveBeenCalled();
    expect(tx.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, status: 'ACTIVE' },
      }),
    );
    expect(tx.courier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_A,
          status: 'ACTIVE',
          user: { status: 'ACTIVE' },
        },
      }),
    );

    expect(result.vehicles).toEqual([
      {
        id: VEHICLE_1,
        plate: 'BAQ-101',
        status: 'ACTIVE',
        maxWeightKg: '100.000',
        maxVolumeM3: '1.000000',
        activeAssignedWeightKg: '15.500',
        activeAssignedVolumeM3: '0.120000',
        remainingWeightKg: '84.500',
        remainingVolumeM3: '0.880000',
        isActive: true,
        isOccupiedInWindow: false,
        isEligible: true,
      },
      {
        id: VEHICLE_2,
        plate: 'BAQ-102',
        status: 'ACTIVE',
        maxWeightKg: '80.000',
        maxVolumeM3: '0.800000',
        activeAssignedWeightKg: '0.000',
        activeAssignedVolumeM3: '0.000000',
        remainingWeightKg: '80.000',
        remainingVolumeM3: '0.800000',
        isActive: true,
        isOccupiedInWindow: false,
        isEligible: true,
      },
    ]);

    expect(result.couriers).toEqual([
      {
        id: COURIER_1,
        userId: '90000000-0000-4000-8000-000000000001',
        email: 'courier1@demo.co',
        status: 'ACTIVE',
        isActive: true,
        isOccupiedInWindow: false,
        isEligible: true,
      },
    ]);

    expect(result.candidatePackages).toEqual([
      {
        id: PKG_1,
        trackingCode: 'PKG-0100',
        state: 'CLASSIFIED',
        priority: 'HIGH',
        zoneId: ZONE_A,
        zoneName: 'Zona Norte',
        sectorId: null,
        sectorName: null,
        address: 'Cra 53 # 82-10',
        municipalityCode: undefined,
        weightKg: '4.25',
        volumeM3: '0.015',
        hasReadyCoordinates: true,
        rawGeocoding: {
          attemptDatasetId: undefined,
          attemptStatus: 'MATCHED',
          isDatasetReady: true,
          networkAttachments: [],
          selectedCandidateId: '99000000-0000-4000-8000-000000000001',
        },
        lastPendingReasonCode: null,
        lastStateChangedAt: null,
      },
    ]);

    expect(result.editableRoutes).toEqual([
      {
        id: ROUTE_PLANNED,
        state: 'PLANNED',
        vehicleId: VEHICLE_1,
        vehiclePlate: 'BAQ-101',
        courierId: COURIER_1,
        courierEmail: 'courier1@demo.co',
        depotId: DEPOT_A,
        plannedStartAt: '2026-10-12T08:00:00.000Z',
        plannedEndAt: '2026-10-12T13:00:00.000Z',
        stopCount: 2,
        assignedPackageCount: 1,
        assignedWeightKg: '15.500',
        assignedVolumeM3: '0.120000',
        remainingWeightKg: '84.500',
        remainingVolumeM3: '0.880000',
      },
    ]);
  });
});
