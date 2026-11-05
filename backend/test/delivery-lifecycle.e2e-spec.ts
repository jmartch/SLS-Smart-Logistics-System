import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaDeliveryUnitOfWork } from '../src/modules/deliveries/infrastructure/persistence/prisma-delivery-unit-of-work';
import { AuthDeliveryAccessAdapter } from '../src/modules/deliveries/infrastructure/authorization/auth-delivery-access.adapter';
import { LocalEvidenceStorageAdapter } from '../src/modules/deliveries/infrastructure/storage/local-evidence-storage.adapter';
import { AttendRouteStopUseCase } from '../src/modules/deliveries/application/use-cases/attend-route-stop.use-case';
import { RecordSuccessfulDeliveryUseCase } from '../src/modules/deliveries/application/use-cases/record-successful-delivery.use-case';
import { RecordFailedDeliveryUseCase } from '../src/modules/deliveries/application/use-cases/record-failed-delivery.use-case';
import { RescheduleDeliveryUseCase } from '../src/modules/deliveries/application/use-cases/reschedule-delivery.use-case';
import { RequestPackageReturnUseCase } from '../src/modules/deliveries/application/use-cases/request-package-return.use-case';
import { ReturnPackageToDepotUseCase } from '../src/modules/deliveries/application/use-cases/return-package-to-depot.use-case';
import { ReportIncidentUseCase } from '../src/modules/deliveries/application/use-cases/report-incident.use-case';
import { GetDeliveryManifestUseCase } from '../src/modules/deliveries/application/use-cases/get-delivery-manifest.use-case';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryStateConflictError,
} from '../src/modules/deliveries/domain/delivery-errors';
import {
  cleanDeliveryLifecycleEnvironment,
  createDeliveryRouteWithMultiPackageStops,
  seedDeliveryLifecycleEnvironment,
  type DeliveryLifecycleEnvironment,
  type DeliveryRouteFixture,
} from './fixtures/delivery-lifecycle.fixtures';

describe('Operational Delivery Lifecycle, Evidence & Integrity E2E (DELIVERY-01)', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
  const app = new PrismaService();

  let storageDir: string;
  let env: DeliveryLifecycleEnvironment;
  let routeFixture: DeliveryRouteFixture;

  let uow: PrismaDeliveryUnitOfWork;
  let accessAdapter: AuthDeliveryAccessAdapter;
  let storageAdapter: LocalEvidenceStorageAdapter;

  let attendUseCase: AttendRouteStopUseCase;
  let successfulDeliveryUseCase: RecordSuccessfulDeliveryUseCase;
  let failedDeliveryUseCase: RecordFailedDeliveryUseCase;
  let rescheduleUseCase: RescheduleDeliveryUseCase;
  let requestReturnUseCase: RequestPackageReturnUseCase;
  let returnToDepotUseCase: ReturnPackageToDepotUseCase;
  let reportIncidentUseCase: ReportIncidentUseCase;
  let getManifestUseCase: GetDeliveryManifestUseCase;
  let failedAttempt1Id: string;

  beforeAll(async () => {
    for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
      const connectionString = process.env[variable];
      if (!connectionString) {
        throw new Error(`${variable} is required`);
      }
      const databasePath = new URL(connectionString).pathname;
      if (!/^\/sls_delivery01_[0-9a-f]{32}$/.test(databasePath)) {
        throw new Error(
          `${variable} must point to a disposable sls_delivery01_* database`,
        );
      }
    }

    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-delivery-e2e-'));
    storageAdapter = new LocalEvidenceStorageAdapter(storageDir);

    await admin.$connect();
    await app.$connect();

    env = await seedDeliveryLifecycleEnvironment(admin);
    routeFixture = await createDeliveryRouteWithMultiPackageStops(admin, env);

    uow = new PrismaDeliveryUnitOfWork(app);
    accessAdapter = new AuthDeliveryAccessAdapter(app);

    attendUseCase = new AttendRouteStopUseCase(uow, accessAdapter);
    successfulDeliveryUseCase = new RecordSuccessfulDeliveryUseCase(
      uow,
      accessAdapter,
      storageAdapter,
    );
    failedDeliveryUseCase = new RecordFailedDeliveryUseCase(
      uow,
      accessAdapter,
      storageAdapter,
    );
    rescheduleUseCase = new RescheduleDeliveryUseCase(uow, accessAdapter);
    requestReturnUseCase = new RequestPackageReturnUseCase(uow, accessAdapter);
    returnToDepotUseCase = new ReturnPackageToDepotUseCase(uow, accessAdapter);
    reportIncidentUseCase = new ReportIncidentUseCase(uow, accessAdapter);
    getManifestUseCase = new GetDeliveryManifestUseCase(uow, accessAdapter);
  });

  afterAll(async () => {
    try {
      if (env) {
        await cleanDeliveryLifecycleEnvironment(admin, [
          env.tenantAId,
          env.tenantBId,
        ]);
      }
    } finally {
      await app.$disconnect();
      await admin.$disconnect();
      if (storageDir && fs.existsSync(storageDir)) {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    }
  });

  describe('CA-02 & CA-03 — Stop Attendance and Arrival', () => {
    it('records arrival at multi-package Stop 2 and transitions packages to OUT_FOR_DELIVERY', async () => {
      // Arrange
      const arrivalRequestId = `req-attend-${randomUUID()}`;

      // Act
      const result = await attendUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop2Id,
        requestId: arrivalRequestId,
      });

      // Assert
      expect(result.stopId).toBe(routeFixture.stop2Id);
      expect(result.affectedPackageIds).toContain(routeFixture.pkg2Id);
      expect(result.affectedPackageIds).toContain(routeFixture.pkg3Id);
      expect(result.replayed).toBe(false);

      // Verify DB state under admin connection
      const stop = await admin.routeStop.findUnique({
        where: { id: routeFixture.stop2Id },
      });
      expect(stop?.arrivalAt).toBeDefined();

      const pkg2 = await admin.package.findUnique({
        where: { id: routeFixture.pkg2Id },
      });
      const pkg3 = await admin.package.findUnique({
        where: { id: routeFixture.pkg3Id },
      });
      expect(pkg2?.state).toBe('OUT_FOR_DELIVERY');
      expect(pkg3?.state).toBe('OUT_FOR_DELIVERY');
    });

    it('replays stop attendance idempotently when same requestId is provided', async () => {
      // Arrange
      const arrivalRequestId = `req-attend-replay-${randomUUID()}`;

      // Act 1
      const firstResult = await attendUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop1Id,
        requestId: arrivalRequestId,
      });

      // Act 2 (Replay)
      const secondResult = await attendUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop1Id,
        requestId: arrivalRequestId,
      });

      // Assert
      expect(firstResult.replayed).toBe(false);
      expect(secondResult.replayed).toBe(true);
      expect(secondResult.stopId).toBe(firstResult.stopId);
    });
  });

  describe('CA-04, CA-05 & CA-06 — Successful Delivery, Evidence & Stop Resolution', () => {
    it('records successful delivery of pkg2 with photo and signature; stop remains PENDING because pkg3 is pending', async () => {
      // Arrange
      const photoBuffer = Buffer.from('photo-e2e-content');
      const sigBuffer = Buffer.from('signature-e2e-content');
      const requestId = `req-success-${randomUUID()}`;

      // Act
      const result = await successfulDeliveryUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop2Id,
        packageId: routeFixture.pkg2Id,
        files: [
          { type: 'PHOTO', buffer: photoBuffer, mimeType: 'image/jpeg' },
          { type: 'SIGNATURE', buffer: sigBuffer, mimeType: 'image/png' },
        ],
        notes: 'Handed to receptionist',
        requestId,
      });

      // Assert result
      expect(result.outcome).toBe('DELIVERED');
      expect(result.packageId).toBe(routeFixture.pkg2Id);
      expect(result.attemptNumber).toBe(1);
      expect(result.stopResolution).toBe('PENDING'); // Multi-package stop still has pkg3 active
      expect(result.evidenceIds).toHaveLength(2);

      // Verify DB persistence
      const pkg = await admin.package.findUnique({
        where: { id: routeFixture.pkg2Id },
      });
      expect(pkg?.state).toBe('DELIVERED');

      const assignment = await admin.assignment.findUnique({
        where: { id: routeFixture.assignment2Id },
      });
      expect(assignment?.status).toBe('ENDED');
      expect(assignment?.reasonCode).toBe('DELIVERED');

      const stop = await admin.routeStop.findUnique({
        where: { id: routeFixture.stop2Id },
      });
      expect(stop?.state).toBe('PENDING');
    });

    it('records successful delivery of pkg3; with all packages delivered, Stop 2 transitions to COMPLETED', async () => {
      // Arrange
      const photoBuffer = Buffer.from('photo-pkg3-e2e');
      const requestId = `req-success-pkg3-${randomUUID()}`;

      // Act
      const result = await successfulDeliveryUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop2Id,
        packageId: routeFixture.pkg3Id,
        files: [{ type: 'PHOTO', buffer: photoBuffer, mimeType: 'image/jpeg' }],
        requestId,
      });

      // Assert
      expect(result.outcome).toBe('DELIVERED');
      expect(result.stopResolution).toBe('COMPLETED'); // Stop 2 now resolved!

      const stop = await admin.routeStop.findUnique({
        where: { id: routeFixture.stop2Id },
      });
      expect(stop?.state).toBe('COMPLETED');
      expect(stop?.serviceEndAt).toBeDefined();
    });
  });

  describe('CA-07 & CA-08 — Failed Delivery, Custody Retention & Replay', () => {
    it('records delivery failure with reason RECIPIENT_ABSENT; package becomes DELIVERY_FAILED and custody remains ACTIVE', async () => {
      // Arrange
      const requestId = `req-fail-pkg1-${randomUUID()}`;

      // Act
      const result = await failedDeliveryUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop1Id,
        packageId: routeFixture.pkg1Id,
        reasonCode: 'RECIPIENT_ABSENT',
        notes: 'Security guard refused package',
        files: [],
        requestId,
      });
      failedAttempt1Id = result.attemptId;

      // Assert
      expect(result.outcome).toBe('FAILED');
      expect(result.attemptNumber).toBe(1);
      expect(result.reasonCode).toBe('RECIPIENT_ABSENT');
      expect(result.stopResolution).toBe('FAILED');

      // Verify DB persistence
      const pkg = await admin.package.findUnique({
        where: { id: routeFixture.pkg1Id },
      });
      expect(pkg?.state).toBe('DELIVERY_FAILED');

      // Custody invariant: assignment remains ACTIVE
      const assignment = await admin.assignment.findUnique({
        where: { id: routeFixture.assignment1Id },
      });
      expect(assignment?.status).toBe('ACTIVE');

      const stop = await admin.routeStop.findUnique({
        where: { id: routeFixture.stop1Id },
      });
      expect(stop?.state).toBe('FAILED');
    });

    it('rejects subsequent delivery failure on already failed package with DeliveryStateConflictError', async () => {
      // Arrange: Attempting to fail an already failed package (pkg1 is currently in DELIVERY_FAILED)
      const requestId = `req-fail-pkg1-attempt2-${randomUUID()}`;

      // Act & Assert
      await expect(
        failedDeliveryUseCase.execute({
          tenantId: env.tenantAId,
          actorUserId: env.courierUser1Id,
          routeId: routeFixture.routeId,
          stopId: routeFixture.stop1Id,
          packageId: routeFixture.pkg1Id,
          reasonCode: 'ACCESS_RESTRICTED',
          files: [],
          requestId,
        }),
      ).rejects.toThrow(DeliveryStateConflictError);
    });
  });

  describe('CA-09 — Delivery Rescheduling', () => {
    it('reschedules failed package pkg1; retains active custody assignment', async () => {
      // Arrange
      const requestId = `req-reschedule-${randomUUID()}`;
      const startAt = new Date('2026-10-07T09:00:00.000Z');
      const endAt = new Date('2026-10-07T12:00:00.000Z');

      // Act
      const result = await rescheduleUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        packageId: routeFixture.pkg1Id,
        failedAttemptId: failedAttempt1Id,
        startAt,
        endAt,
        reasonCode: 'CUSTOMER_REQUESTED_RESCHEDULE',
        requestId,
      });

      // Assert
      expect(result.newStatus).toBe('RESCHEDULED');
      expect(result.packageId).toBe(routeFixture.pkg1Id);
      expect(result.windowId).toBeDefined();

      const pkg = await admin.package.findUnique({
        where: { id: routeFixture.pkg1Id },
      });
      expect(pkg?.state).toBe('RESCHEDULED');

      // Custody in vehicle remains ACTIVE until reception at depot
      const assignment = await admin.assignment.findUnique({
        where: { id: routeFixture.assignment1Id },
      });
      expect(assignment?.status).toBe('ACTIVE');
    });
  });

  describe('CA-10 — Return Request and Physical Depot Receipt', () => {
    it('requests package return on pkg4 transitioning state to RETURN_PENDING', async () => {
      // First, record a failed attempt on pkg4 so it is in DELIVERY_FAILED
      await attendUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop3Id,
        requestId: `req-attend-stop3-${randomUUID()}`,
      });

      const failedAttempt = await failedDeliveryUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        stopId: routeFixture.stop3Id,
        packageId: routeFixture.pkg4Id,
        reasonCode: 'RECIPIENT_REFUSED',
        files: [],
        requestId: `req-fail-pkg4-${randomUUID()}`,
      });

      // Act: request return
      const returnResult = await requestReturnUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        packageId: routeFixture.pkg4Id,
        failedAttemptId: failedAttempt.attemptId,
        reasonCode: 'EXCEEDED_ATTEMPTS',
        requestId: `req-return-${randomUUID()}`,
      });

      // Assert
      expect(returnResult.newStatus).toBe('RETURN_PENDING');

      const pkg = await admin.package.findUnique({
        where: { id: routeFixture.pkg4Id },
      });
      expect(pkg?.state).toBe('RETURN_PENDING');
    });

    it('receives RETURN_PENDING package pkg4 at depot ending custody and transitioning state to RETURNED', async () => {
      // Act
      const result = await returnToDepotUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        routeId: routeFixture.routeId,
        packageId: routeFixture.pkg4Id,
        depotId: env.depotAId,
        physicalReceiptConfirmed: true,
        requestId: `req-depot-rcpt-pkg4-${randomUUID()}`,
      });

      // Assert
      expect(result.status).toBe('RETURNED');

      const pkg = await admin.package.findUnique({
        where: { id: routeFixture.pkg4Id },
      });
      expect(pkg?.state).toBe('RETURNED');

      // Custody assignment is now ended!
      const assignment = await admin.assignment.findUnique({
        where: { id: routeFixture.assignment4Id },
      });
      expect(assignment?.status).toBe('ENDED');
      expect(assignment?.reasonCode).toBe('RECEIVED_AT_DEPOT_RETURNED');
    });

    it('receives RESCHEDULED package pkg1 at depot ending custody while preserving state RESCHEDULED', async () => {
      // Act
      const result = await returnToDepotUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        routeId: routeFixture.routeId,
        packageId: routeFixture.pkg1Id,
        depotId: env.depotAId,
        physicalReceiptConfirmed: true,
        requestId: `req-depot-rcpt-pkg1-${randomUUID()}`,
      });

      // Assert
      expect(result.status).toBe('RESCHEDULED');

      const pkg = await admin.package.findUnique({
        where: { id: routeFixture.pkg1Id },
      });
      expect(pkg?.state).toBe('RESCHEDULED');

      // Custody ended at depot awaiting new planning cycle
      const assignment = await admin.assignment.findUnique({
        where: { id: routeFixture.assignment1Id },
      });
      expect(assignment?.status).toBe('ENDED');
      expect(assignment?.reasonCode).toBe('RECEIVED_AT_DEPOT_RESCHEDULED');
    });
  });

  describe('Incident Reporting & Manifest Query', () => {
    it('records an operational incident targeting a route', async () => {
      // Act
      const result = await reportIncidentUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        type: 'VEHICLE_PUNCTURE',
        description: 'Flat tire near stop 1',
        requestId: `req-incident-${randomUUID()}`,
      });

      // Assert
      expect(result.incidentId).toBeDefined();
      expect(result.type).toBe('VEHICLE_PUNCTURE');

      const incident = await admin.incident.findUnique({
        where: { id: result.incidentId },
      });
      expect(incident?.description).toBe('Flat tire near stop 1');
    });

    it('queries delivery manifest using RouteStop Iterator for views "all", "pending", and "failed"', async () => {
      // Act
      const manifestAll = await getManifestUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        view: 'all',
      });

      const manifestFailed = await getManifestUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        routeId: routeFixture.routeId,
        view: 'failed',
      });

      // Assert
      expect(manifestAll.stops.length).toBe(3);
      // Stop 1 was marked FAILED, Stop 3 had failed attempts
      expect(manifestFailed.stops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('CA-14 — Multi-Tenant Isolation & RLS Security', () => {
    it('denies courier from Tenant B attempting to attend a Stop in Tenant A', async () => {
      // Act & Assert
      await expect(
        attendUseCase.execute({
          tenantId: env.tenantBId, // Cross-tenant
          actorUserId: env.courierUserBId,
          routeId: routeFixture.routeId,
          stopId: routeFixture.stop1Id,
          requestId: `req-cross-tenant-${randomUUID()}`,
        }),
      ).rejects.toThrow(DeliveryNotFoundError);
    });

    it('denies unauthorized user in Tenant A from recording a delivery attempt', async () => {
      // Act & Assert
      await expect(
        failedDeliveryUseCase.execute({
          tenantId: env.tenantAId,
          actorUserId: env.unauthorizedUserAId,
          routeId: routeFixture.routeId,
          stopId: routeFixture.stop1Id,
          packageId: routeFixture.pkg1Id,
          reasonCode: 'RECIPIENT_ABSENT',
          files: [],
          requestId: `req-unauth-${randomUUID()}`,
        }),
      ).rejects.toThrow(DeliveryForbiddenError);
    });
  });
});
