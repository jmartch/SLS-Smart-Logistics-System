import { PrismaService } from '../../../database/prisma.service';
import { Route } from '../domain/route';
import { RouteState } from '../domain/route-state';
import { RouteStop } from '../domain/route-stop';
import { RouteStopState } from '../domain/route-stop-state';
import { PrismaRouteRepository } from '../infrastructure/persistence/prisma-route.repository';
import { Prisma } from '../../../../generated/prisma/client';

describe('PrismaRouteRepository', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const routeId = '22222222-2222-2222-2222-222222222222';
  const vehicleId = '33333333-3333-3333-3333-333333333333';
  const courierId = '44444444-4444-4444-4444-444444444444';
  const planningRequestId = '55555555-5555-5555-5555-555555555555';

  let mockPrisma: any;
  let repository: PrismaRouteRepository;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) =>
        cb(mockPrisma),
      ),
      $executeRaw: jest.fn().mockResolvedValue(1),
      route: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      routeStop: {
        upsert: jest.fn(),
      },
      zone: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    repository = new PrismaRouteRepository(
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('findById', () => {
    it('returns reconstituted domain Route aggregate when route is found', async () => {
      // Arrange
      const rawRoute = {
        id: routeId,
        tenantId,
        planningRequestId,
        vehicleId,
        courierId,
        depotId: null,
        state: 'PLANNED',
        plannedAt: new Date('2026-10-06T08:00:00Z'),
        startedAt: null,
        completedAt: null,
        plannedStartAt: new Date('2026-10-06T09:00:00Z'),
        plannedEndAt: new Date('2026-10-06T17:00:00Z'),
        vehicle: { plate: 'ABC-123' },
        courier: { user: { email: 'courier@sls.local' } },
        depot: null,
        planningRequest: { parameters: { zoneId: 'zone-1' } },
        stops: [
          {
            id: 'stop-1',
            tenantId,
            routeId,
            sequence: 1,
            latitude: new Prisma.Decimal('10.963889'),
            longitude: new Prisma.Decimal('-74.796389'),
            state: 'PENDING',
            assignments: [
              {
                package: {
                  id: 'pkg-1',
                  trackingCode: 'TRK-001',
                  address: { originalText: 'Calle 72 # 54-10' },
                },
              },
            ],
          },
          {
            id: 'stop-2',
            tenantId,
            routeId,
            sequence: 2,
            latitude: new Prisma.Decimal('10.970000'),
            longitude: new Prisma.Decimal('-74.800000'),
            state: 'PENDING',
            assignments: [],
          },
        ],
      };

      mockPrisma.route.findUnique.mockResolvedValue(rawRoute);
      mockPrisma.zone.findUnique.mockResolvedValue({ name: 'Zona Norte' });

      // Act
      const result = await repository.findById(tenantId, routeId);

      // Assert
      expect(result).toBeInstanceOf(Route);
      expect(result?.id).toBe(routeId);
      expect(result?.tenantId).toBe(tenantId);
      expect(result?.state).toBe(RouteState.PLANNED);
      expect(result?.vehiclePlate).toBe('ABC-123');
      expect(result?.courierEmail).toBe('courier@sls.local');
      expect(result?.zoneId).toBe('zone-1');
      expect(result?.zoneName).toBe('Zona Norte');
      expect(result?.stops).toHaveLength(2);
      expect(result?.stops?.[0]?.stopNumber).toBe(1);
      expect(result?.stops?.[0]?.packageId).toBe('pkg-1');
      expect(result?.stops?.[0]?.trackingCode).toBe('TRK-001');
      expect(result?.stops?.[0]?.address).toBe('Calle 72 # 54-10');
      expect(result?.stops?.[1]?.stopNumber).toBe(2);
      expect(mockPrisma.route.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_id: {
            tenantId,
            id: routeId,
          },
        },
        include: {
          vehicle: {
            select: { plate: true },
          },
          courier: {
            select: {
              user: {
                select: { email: true },
              },
            },
          },
          depot: {
            select: { name: true },
          },
          planningRequest: {
            select: { parameters: true },
          },
          stops: {
            orderBy: { sequence: 'asc' },
            include: {
              assignments: {
                where: { status: 'ACTIVE' },
                select: {
                  package: {
                    select: {
                      id: true,
                      trackingCode: true,
                      address: {
                        select: { originalText: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    it('returns null when route does not exist', async () => {
      // Arrange
      mockPrisma.route.findUnique.mockResolvedValue(null);

      // Act
      const result = await repository.findById(tenantId, routeId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('upserts route and stops within tenant boundary', async () => {
      // Arrange
      const stop = new RouteStop({
        id: 'stop-1',
        tenantId,
        routeId,
        stopNumber: 1,
        latitude: 10.963889,
        longitude: -74.796389,
        state: RouteStopState.PENDING,
      });

      const route = new Route({
        id: routeId,
        tenantId,
        planningRequestId,
        vehicleId,
        courierId,
        state: RouteState.PLANNED,
        plannedAt: new Date('2026-10-06T08:00:00Z'),
        stops: [stop],
      });

      // Act
      await repository.save(route);

      // Assert
      expect(mockPrisma.route.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_id: {
            tenantId,
            id: routeId,
          },
        },
        create: expect.objectContaining({
          id: routeId,
          tenantId,
          state: 'PLANNED',
        }),
        update: expect.objectContaining({
          state: 'PLANNED',
        }),
      });

      expect(mockPrisma.routeStop.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_id: {
            tenantId,
            id: 'stop-1',
          },
        },
        create: expect.objectContaining({
          id: 'stop-1',
          tenantId,
          routeId,
          sequence: 1,
        }),
        update: expect.objectContaining({
          sequence: 1,
        }),
      });
    });
  });

  describe('findMany', () => {
    it('filters routes by tenant, state, courier, and pagination', async () => {
      // Arrange
      mockPrisma.route.count.mockResolvedValue(1);
      mockPrisma.route.findMany.mockResolvedValue([
        {
          id: routeId,
          tenantId,
          state: 'READY',
          vehicleId,
          courierId,
          depotId: null,
          plannedStartAt: new Date('2026-10-06T09:00:00Z'),
          plannedEndAt: new Date('2026-10-06T17:00:00Z'),
          startedAt: null,
          completedAt: null,
          vehicle: { plate: 'XYZ-789' },
          courier: { user: { email: 'mensajero@sls.local' } },
          depot: null,
          planningRequest: {
            parameters: { zoneId: 'zone-north' },
          },
          _count: {
            stops: 5,
          },
        },
      ]);
      mockPrisma.zone.findMany.mockResolvedValue([
        { id: 'zone-north', name: 'Zona Norte' },
      ]);

      // Act
      const result = await repository.findMany(tenantId, {
        page: 1,
        pageSize: 10,
        state: RouteState.READY,
        courierId,
        zoneId: 'zone-north',
      });

      // Assert
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: routeId,
          tenantId,
          state: RouteState.READY,
          vehicleId,
          courierId,
          zoneId: 'zone-north',
          zoneName: 'Zona Norte',
          vehiclePlate: 'XYZ-789',
          courierEmail: 'mensajero@sls.local',
          stopCount: 5,
        }),
      );

      expect(mockPrisma.route.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            state: 'READY',
            courierId,
            planningRequest: {
              parameters: {
                path: ['zoneId'],
                equals: 'zone-north',
              },
            },
          }),
          skip: 0,
          take: 10,
        }),
      );
    });
  });
});
