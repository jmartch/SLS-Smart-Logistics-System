import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';
import { PackageGeocodingConfigAdapter } from '../src/config/package-geocoding.config';
import { PrismaRouteRoadWaypointRepository } from '../src/modules/route-planning/infrastructure/route-road-waypoint.repository';

const COOKIE_NAME = 'sls_session';

function sessionCookie(response: request.Response): string {
  const value: unknown = response.headers['set-cookie'];
  const headers = Array.isArray(value) ? (value as string[]) : [];
  const header = headers.find((h) => h.startsWith(`${COOKIE_NAME}=`));
  if (!header) {
    throw new Error('login response did not set the session cookie');
  }
  return header.split(';')[0];
}

interface HttpGeocodingBody {
  status: string;
  eligibility: string;
  attemptId?: string | null;
  selectedCandidateId?: string | null;
  attachmentId?: string | null;
  attachmentStatus?: string | null;
  unsuitabilityReason?: string | null;
  profile?: string | null;
}

interface HttpPackageBody {
  id: string;
  state?: string;
  addressId?: string;
  geocodingAttemptId?: string | null;
  geocoding: HttpGeocodingBody;
}

interface HttpAddressCorrectionBody {
  packageId: string;
  previousAddressId: string;
  newAddressId: string;
  geocoding: HttpGeocodingBody;
}

interface HttpClassifyBody {
  id: string;
  state: string;
}

interface HttpPlanningStopBody {
  routeStopId: string;
  sequence: number;
  packageId: string;
}

interface HttpPlanningRouteBody {
  routeId: string;
  stops: HttpPlanningStopBody[];
}

interface HttpPlanningResultBody {
  status: string;
  routes: HttpPlanningRouteBody[];
}

describe('PKG-GEO-01 integration and E2E', () => {
  jest.setTimeout(120_000);

  let app: INestApplication<App>;
  let server: App;

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const slugA = `pkg-geo-a-${randomUUID().slice(0, 8)}`;
  const slugB = `pkg-geo-b-${randomUUID().slice(0, 8)}`;

  const userCoordinatorA = randomUUID();
  const userReceptionA = randomUUID();
  const userCoordinatorB = randomUUID();

  const shipmentTypeA = randomUUID();
  const shipmentTypeB = randomUUID();
  const zoneA = randomUUID();

  const readyDatasetId = randomUUID();
  const stagingDatasetId = randomUUID();
  const refCalle80 = randomUUID();
  const refAmbiguous1 = randomUUID();
  const refAmbiguous2 = randomUUID();

  const roadNode1 = randomUUID();
  const roadNode2 = randomUUID();
  const roadEdge1 = randomUUID();

  let cookieCoordinatorA: string;
  let cookieReceptionA: string;
  let cookieCoordinatorB: string;

  async function login(
    slug: string,
    email: string,
    password: string,
  ): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ slug, email, password });
    expect(response.status).toBe(200);
    return sessionCookie(response);
  }

  beforeAll(async () => {
    await admin.$connect();

    const password = randomBytes(18).toString('base64url');
    const passwordHash = await hashPassword(password);

    const permissions = await admin.permission.findMany({
      where: {
        code: {
          in: [
            'REGISTER_PACKAGES',
            'CLASSIFY_PACKAGES',
            'COORDINATE_ROUTES',
            'MANAGE_TENANT',
          ],
        },
      },
    });

    await admin.tenant.createMany({
      data: [
        {
          id: tenantA,
          name: `Tenant A ${tenantA}`,
          slug: slugA,
          status: 'ACTIVE',
        },
        {
          id: tenantB,
          name: `Tenant B ${tenantB}`,
          slug: slugB,
          status: 'ACTIVE',
        },
      ],
    });

    const roleCoordinatorA = randomUUID();
    const roleReceptionA = randomUUID();
    const roleCoordinatorB = randomUUID();

    await admin.role.createMany({
      data: [
        { id: roleCoordinatorA, tenantId: tenantA, name: 'Coordinator A' },
        { id: roleReceptionA, tenantId: tenantA, name: 'Reception A' },
        { id: roleCoordinatorB, tenantId: tenantB, name: 'Coordinator B' },
      ],
    });

    await admin.rolePermission.createMany({
      data: [
        ...permissions.map((p) => ({
          tenantId: tenantA,
          roleId: roleCoordinatorA,
          permissionId: p.id,
        })),
        ...permissions
          .filter((p) => p.code === 'REGISTER_PACKAGES')
          .map((p) => ({
            tenantId: tenantA,
            roleId: roleReceptionA,
            permissionId: p.id,
          })),
        ...permissions.map((p) => ({
          tenantId: tenantB,
          roleId: roleCoordinatorB,
          permissionId: p.id,
        })),
      ],
    });

    await admin.user.createMany({
      data: [
        {
          id: userCoordinatorA,
          tenantId: tenantA,
          email: `coordinator-a@${slugA}.com`,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: userReceptionA,
          tenantId: tenantA,
          email: `reception-a@${slugA}.com`,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: userCoordinatorB,
          tenantId: tenantB,
          email: `coordinator-b@${slugB}.com`,
          passwordHash,
          status: 'ACTIVE',
        },
      ],
    });

    await admin.userRole.createMany({
      data: [
        {
          tenantId: tenantA,
          userId: userCoordinatorA,
          roleId: roleCoordinatorA,
        },
        { tenantId: tenantA, userId: userReceptionA, roleId: roleReceptionA },
        {
          tenantId: tenantB,
          userId: userCoordinatorB,
          roleId: roleCoordinatorB,
        },
      ],
    });

    await admin.shipmentType.createMany({
      data: [
        {
          id: shipmentTypeA,
          tenantId: tenantA,
          name: 'Standard A',
          code: 'STD-A',
        },
        {
          id: shipmentTypeB,
          tenantId: tenantB,
          name: 'Standard B',
          code: 'STD-B',
        },
      ],
    });

    await admin.zone.create({
      data: {
        id: zoneA,
        tenantId: tenantA,
        code: 'ZONE-A',
        name: 'Zone North A',
      },
    });

    await admin.geoDataset.createMany({
      data: [
        {
          id: readyDatasetId,
          name: 'Barranquilla Test Dataset',
          sourceType: 'SYNTHETIC',
          sourceReference: 'pkg-geo-01-fixture',
          sourceDate: new Date(),
          checksum: 'a'.repeat(64),
          license: 'Synthetic test data',
          coverage: 'Barranquilla',
          importerVersion: 'pkg-geo-01-v1',
          status: 'READY',
          readyAt: new Date(),
        },
        {
          id: stagingDatasetId,
          name: 'Staging Dataset',
          sourceType: 'SYNTHETIC',
          sourceReference: 'pkg-geo-01-staging',
          sourceDate: new Date(),
          checksum: 'b'.repeat(64),
          license: 'Synthetic test data',
          coverage: 'Barranquilla',
          importerVersion: 'pkg-geo-01-v1',
          status: 'STAGING',
        },
      ],
    });

    await admin.$executeRaw`
            INSERT INTO "AddressReference" (
                "id", "datasetId", "sourceRecordId", "municipalityCode",
                "streetType", "streetIdentifier", "generatingRoad", "plateNumber",
                "neighborhood", "normalizedAddress", "searchKey", "location", "precision"
            ) VALUES (
                ${refCalle80}::uuid, ${readyDatasetId}::uuid, 'ref-calle-80', '08001',
                'CALLE', '80', '53', '67', 'Alto Prado',
                'CALLE 80 # 53-67', 'CALLE|80|53|67',
                ST_SetSRID(ST_MakePoint(-74.8271, 11.0132), 4326), 'ENTRANCE'
            )
        `;

    await admin.$executeRaw`
            INSERT INTO "AddressReference" (
                "id", "datasetId", "sourceRecordId", "municipalityCode",
                "streetType", "streetIdentifier", "generatingRoad", "plateNumber",
                "neighborhood", "normalizedAddress", "searchKey", "location", "precision"
            ) VALUES
            (
                ${refAmbiguous1}::uuid, ${readyDatasetId}::uuid, 'ref-ambig-1', '08001',
                'CARRERA', '53', '80', '67', 'Alto Prado',
                'CARRERA 53 # 80-67', 'CARRERA|53|80|67',
                ST_SetSRID(ST_MakePoint(-74.8273, 11.0134), 4326), 'BUILDING'
            ),
            (
                ${refAmbiguous2}::uuid, ${readyDatasetId}::uuid, 'ref-ambig-2', '08001',
                'CARRERA', '53', '80', '67', 'El Golf',
                'CARRERA 53 # 80-67', 'CARRERA|53|80|67',
                ST_SetSRID(ST_MakePoint(-74.8274, 11.0134), 4326), 'BUILDING'
            )
        `;

    await admin.$executeRaw`
            INSERT INTO "RoadNode" ("id", "datasetId", "location")
            VALUES
            (
                ${roadNode1}::uuid, ${readyDatasetId}::uuid,
                ST_SetSRID(ST_MakePoint(-74.8272, 11.0133), 4326)
            ),
            (
                ${roadNode2}::uuid, ${readyDatasetId}::uuid,
                ST_SetSRID(ST_MakePoint(-74.8275, 11.0135), 4326)
            )
        `;

    await admin.$executeRaw`
            INSERT INTO "RoadEdge" (
                "id", "datasetId", "fromNodeId", "toNodeId", "profile",
                "distanceM", "durationS", "roadClass", "geometry"
            ) VALUES (
                ${roadEdge1}::uuid, ${readyDatasetId}::uuid,
                ${roadNode1}::uuid, ${roadNode2}::uuid,
                'MOTOR_VEHICLE', 45.0, 10.0, 'residential',
                ST_GeomFromText('LINESTRING(-74.8272 11.0133, -74.8275 11.0135)', 4326)
            )
        `;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PackageGeocodingConfigAdapter)
      .useValue(
        new PackageGeocodingConfigAdapter({
          '08001': {
            datasetId: readyDatasetId,
            profile: 'MOTOR_VEHICLE',
            maxAcceptanceRadiusMeters: 100,
            maxReviewRadiusMeters: 500,
          },
        }),
      )
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();

    cookieCoordinatorA = await login(
      slugA,
      `coordinator-a@${slugA}.com`,
      password,
    );
    cookieReceptionA = await login(slugA, `reception-a@${slugA}.com`, password);
    cookieCoordinatorB = await login(
      slugB,
      `coordinator-b@${slugB}.com`,
      password,
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    await admin.$disconnect();
  });

  it('Scenario 1: registers package with immediate MATCHED geocoding and network attachment', async () => {
    const payload = {
      trackingCode: `TRK-MATCH-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle 80 # 53-67',
        municipalityCode: '08001',
      },
      weightKg: 2.5,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 10,
    };

    const res = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(payload);

    if (res.status !== 201) {
      process.stderr.write(
        `Scenario 1 error status: ${res.status}, body: ${JSON.stringify(res.body)}\n`,
      );
    }

    const regBody = res.body as HttpPackageBody;
    expect(res.status).toBe(201);
    expect(regBody.id).toBeDefined();
    expect(regBody.state).toBe('REGISTERED');
    expect(regBody.geocoding).toBeDefined();
    expect(regBody.geocoding.status).toBe('MATCHED');
    expect(regBody.geocoding.eligibility).toBe('ELIGIBLE');
    expect(regBody.geocoding.selectedCandidateId).toBeDefined();
    expect(regBody.geocoding.attachmentId).toBeDefined();
    expect(regBody.geocoding.attachmentStatus).toBe('AUTO_ACCEPTED');

    const detailRes = await request(server)
      .get(`/api/v1/packages/${regBody.id}`)
      .set('Cookie', cookieCoordinatorA);

    const detailBody = detailRes.body as HttpPackageBody;
    expect(detailRes.status).toBe(200);
    expect(detailBody.addressId).toBe(regBody.addressId);
    expect(detailBody.geocodingAttemptId).toBeDefined();
    expect(detailBody.geocoding).toBeDefined();
    expect(detailBody.geocoding.status).toBe('MATCHED');
    expect(detailBody.geocoding.eligibility).toBe('ELIGIBLE');
  });

  it('Scenario 2: registers package resulting in NOT_FOUND when address cannot be resolved', async () => {
    const payload = {
      trackingCode: `TRK-NOTFOUND-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle 99 # 99-99',
        municipalityCode: '08001',
      },
      weightKg: 1.0,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    };

    const res = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(payload);

    if (res.status !== 201) {
      process.stderr.write(
        `Scenario 1 error status: ${res.status}, body: ${JSON.stringify(res.body)}\n`,
      );
    }

    const regBody = res.body as HttpPackageBody;
    expect(res.status).toBe(201);
    expect(regBody.id).toBeDefined();
    expect(regBody.geocoding.status).toBe('NOT_FOUND');
    expect(regBody.geocoding.eligibility).toBe('INELIGIBLE');
    expect(regBody.geocoding.attachmentId).toBeNull();
  });

  it('Scenario 3: registers package resulting in REVIEW_REQUIRED on ambiguous candidates', async () => {
    const payload = {
      trackingCode: `TRK-REVIEW-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Carrera 53 # 80-67',
        municipalityCode: '08001',
      },
      weightKg: 1.5,
      lengthCm: 12,
      widthCm: 12,
      heightCm: 12,
    };

    const res = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(payload);

    if (res.status !== 201) {
      process.stderr.write(
        `Scenario 1 error status: ${res.status}, body: ${JSON.stringify(res.body)}\n`,
      );
    }

    const regBody = res.body as HttpPackageBody;
    expect(res.status).toBe(201);
    expect(regBody.geocoding.status).toBe('REVIEW_REQUIRED');
    expect(regBody.geocoding.eligibility).toBe('INELIGIBLE');
    expect(regBody.geocoding.selectedCandidateId).toBeNull();
  });

  it('Scenario 4: resolves package geocoding and manual candidate review workflow', async () => {
    const registerPayload = {
      trackingCode: `TRK-REV-FLOW-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Carrera 53 # 80-67',
        municipalityCode: '08001',
      },
      weightKg: 1.5,
      lengthCm: 12,
      widthCm: 12,
      heightCm: 12,
    };

    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(registerPayload);

    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    const addressId = regBody.addressId;
    const attemptId = regBody.geocoding.attemptId;

    const candidates = await admin.geocodingCandidate.findMany({
      where: { attemptId: attemptId ?? undefined },
      orderBy: { rank: 'asc' },
    });
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const chosenCandidate = candidates[0];

    const reviewPayload = {
      expectedAddressId: addressId,
      expectedAttemptId: attemptId,
      candidateId: chosenCandidate.id,
      decision: 'APPROVED',
      reason: 'Operator verified address on local map',
    };

    const reviewRes = await request(server)
      .post(`/api/v1/packages/${packageId}/geocoding/review`)
      .set('Cookie', cookieCoordinatorA)
      .send(reviewPayload);

    const reviewBody = reviewRes.body as HttpGeocodingBody;
    expect(reviewRes.status).toBe(200);
    expect(reviewBody.status).toBe('MATCHED');
    expect(reviewBody.eligibility).toBe('ELIGIBLE');
    expect(reviewBody.selectedCandidateId).toBe(chosenCandidate.id);
    expect(reviewBody.attachmentId).toBeDefined();
    expect(reviewBody.attachmentStatus).toBe('AUTO_ACCEPTED');

    const detailRes = await request(server)
      .get(`/api/v1/packages/${packageId}`)
      .set('Cookie', cookieCoordinatorA);

    const detailBody = detailRes.body as HttpPackageBody;
    expect(detailBody.geocoding.status).toBe('MATCHED');
    expect(detailBody.geocoding.eligibility).toBe('ELIGIBLE');
  });

  it('Scenario 5: corrects package address and re-executes geocoding resolution', async () => {
    const registerPayload = {
      trackingCode: `TRK-CORR-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle Desconocida 123',
        municipalityCode: '08001',
      },
      weightKg: 1.0,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    };

    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(registerPayload);

    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    const oldAddressId = regBody.addressId;
    expect(regBody.geocoding.status).toBe('UNSUPPORTED_ADDRESS_FORMAT');

    const correctionPayload = {
      expectedAddressId: oldAddressId,
      newOriginalText: 'Calle 80 # 53-67',
      newMunicipalityCode: '08001',
      reason: 'Customer clarified real street number',
    };

    const corrRes = await request(server)
      .post(`/api/v1/packages/${packageId}/address-corrections`)
      .set('Cookie', cookieCoordinatorA)
      .send(correctionPayload);

    const corrBody = corrRes.body as HttpAddressCorrectionBody;
    expect(corrRes.status).toBe(200);
    expect(corrBody.packageId).toBe(packageId);
    expect(corrBody.previousAddressId).toBe(oldAddressId);
    expect(corrBody.newAddressId).not.toBe(oldAddressId);
    expect(corrBody.geocoding.status).toBe('MATCHED');
    expect(corrBody.geocoding.eligibility).toBe('ELIGIBLE');
    expect(corrBody.geocoding.attachmentId).toBeDefined();
  });

  it('Scenario 6: enforces idempotency with operationId and rejects conflict on altered payload', async () => {
    const operationId = randomUUID();
    const registerPayload = {
      trackingCode: `TRK-IDEMP-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle 80 # 53-67',
        municipalityCode: '08001',
      },
      weightKg: 2.0,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    };

    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(registerPayload);

    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;

    const resolvePayload = {
      operationId,
      forceRetry: true,
    };

    const firstRes = await request(server)
      .post(`/api/v1/packages/${packageId}/geocoding/resolve`)
      .set('Cookie', cookieCoordinatorA)
      .send(resolvePayload);

    const firstBody = firstRes.body as HttpGeocodingBody;
    expect(firstRes.status).toBe(200);
    expect(firstBody.status).toBe('MATCHED');

    const replayRes = await request(server)
      .post(`/api/v1/packages/${packageId}/geocoding/resolve`)
      .set('Cookie', cookieCoordinatorA)
      .send(resolvePayload);

    const replayBody = replayRes.body as HttpGeocodingBody;
    expect(replayRes.status).toBe(200);
    expect(replayBody.status).toBe('MATCHED');

    const conflictingPayload = {
      operationId,
      forceRetry: false,
    };

    const conflictRes = await request(server)
      .post(`/api/v1/packages/${packageId}/geocoding/resolve`)
      .set('Cookie', cookieCoordinatorA)
      .send(conflictingPayload);

    expect(conflictRes.status).toBe(409);
  });

  it('Scenario 7: enforces multi-tenant isolation across tenants A and B', async () => {
    const registerPayload = {
      trackingCode: `TRK-TENANT-A-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle 80 # 53-67',
        municipalityCode: '08001',
      },
      weightKg: 1.0,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    };

    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(registerPayload);

    const regBodyA = regRes.body as HttpPackageBody;
    const packageIdA = regBodyA.id;
    const addressIdA = regBodyA.addressId;

    const crossGetRes = await request(server)
      .get(`/api/v1/packages/${packageIdA}`)
      .set('Cookie', cookieCoordinatorB);

    expect(crossGetRes.status).toBe(404);

    const crossResolveRes = await request(server)
      .post(`/api/v1/packages/${packageIdA}/geocoding/resolve`)
      .set('Cookie', cookieCoordinatorB)
      .send({ expectedAttemptId: null });

    expect(crossResolveRes.status).toBe(404);

    const crossCorrectionRes = await request(server)
      .post(`/api/v1/packages/${packageIdA}/address-corrections`)
      .set('Cookie', cookieCoordinatorB)
      .send({
        expectedAddressId: addressIdA,
        newOriginalText: 'Calle 80 # 53-67',
        newMunicipalityCode: '08001',
        reason: 'Unauthorized cross-tenant attempt',
      });

    expect(crossCorrectionRes.status).toBe(404);
  });

  it('Scenario 8: requires CLASSIFY_PACKAGES or MANAGE_TENANT for resolution and review', async () => {
    const registerPayload = {
      trackingCode: `TRK-PERM-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle 80 # 53-67',
        municipalityCode: '08001',
      },
      weightKg: 1.0,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    };

    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieReceptionA)
      .send(registerPayload);

    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;

    const forbiddenResolveRes = await request(server)
      .post(`/api/v1/packages/${packageId}/geocoding/resolve`)
      .set('Cookie', cookieReceptionA)
      .send({});

    expect(forbiddenResolveRes.status).toBe(403);
  });

  it('Scenario 9: rejects conflict on stale attempt reference without persistence effects', async () => {
    const payload = {
      trackingCode: `TRK-CONFLICT-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle 80 # 53-67',
        municipalityCode: '08001',
      },
      weightKg: 2.0,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
    };

    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(payload);

    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    const initialAttemptId = regBody.geocoding.attemptId;

    const candidateCountBefore = await admin.geocodingCandidate.count({
      where: { tenantId: tenantA },
    });

    const invalidResolveRes = await request(server)
      .post(`/api/v1/packages/${packageId}/geocoding/resolve`)
      .set('Cookie', cookieCoordinatorA)
      .send({
        expectedAttemptId: randomUUID(),
        forceRetry: true,
      });

    expect(invalidResolveRes.status).toBe(409);

    const candidateCountAfter = await admin.geocodingCandidate.count({
      where: { tenantId: tenantA },
    });
    expect(candidateCountAfter).toBe(candidateCountBefore);

    const pkgInDb = await admin.package.findUnique({
      where: { id: packageId },
    });
    expect(pkgInDb?.geocodingAttemptId).toBe(initialAttemptId);
  });

  it('Scenario 10: advances geocoded package through classification and route planning with geocodingAttemptId on RouteStop', async () => {
    const vehicleId = randomUUID();
    const courierId = randomUUID();
    const depotId = randomUUID();

    await admin.vehicle.create({
      data: {
        id: vehicleId,
        tenantId: tenantA,
        plate: `PLN${randomUUID().slice(0, 4).toUpperCase()}`,
        maxWeightKg: 100,
        maxVolumeM3: 5,
        status: 'ACTIVE',
      },
    });

    await admin.courier.create({
      data: {
        id: courierId,
        tenantId: tenantA,
        userId: userCoordinatorA,
        status: 'ACTIVE',
      },
    });

    await admin.$executeRaw`
            INSERT INTO "Depot" ("id", "tenantId", "name", "location", "timeZone", "openingHours")
            VALUES (
                ${depotId}::uuid,
                ${tenantA}::uuid,
                'Depot Central A',
                ST_SetSRID(ST_MakePoint(-74.8270, 11.0130), 4326),
                'America/Bogota',
                '{}'::jsonb
            )
        `;

    const regPayload = {
      trackingCode: `TRK-PLAN-${randomUUID().slice(0, 6)}`,
      shipmentTypeId: shipmentTypeA,
      zoneId: zoneA,
      address: {
        text: 'Calle 80 # 53-67',
        municipalityCode: '08001',
      },
      weightKg: 3.0,
      lengthCm: 15,
      widthCm: 15,
      heightCm: 15,
    };

    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send(regPayload);

    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    const attemptId = regBody.geocoding.attemptId;
    expect(regBody.geocoding.status).toBe('MATCHED');
    expect(regBody.geocoding.eligibility).toBe('ELIGIBLE');

    const classifyRes = await request(server)
      .post(`/api/v1/packages/${packageId}/classify`)
      .set('Cookie', cookieCoordinatorA)
      .send({ zoneId: zoneA });

    const classifyBody = classifyRes.body as HttpClassifyBody;
    expect(classifyRes.status).toBe(200);
    expect(classifyBody.state).toBe('CLASSIFIED');

    const planRequestId = randomUUID();
    const horizonStart = new Date(Date.now() + 3600_000).toISOString();
    const horizonEnd = new Date(Date.now() + 7200_000).toISOString();

    const planRes = await request(server)
      .post('/api/v1/routes/planning/plan-and-assign')
      .set('Cookie', cookieCoordinatorA)
      .send({
        requestId: planRequestId,
        zoneId: zoneA,
        depotId,
        packageIds: [packageId],
        resourceSelection: 'MANUAL',
        vehicleIds: [vehicleId],
        courierIds: [courierId],
        datasetId: readyDatasetId,
        profile: 'MOTOR_VEHICLE',
        window: { startAt: horizonStart, endAt: horizonEnd },
        radiusMeters: 5000,
        ordering: 'nearest-neighbor',
      });

    expect(planRes.status).toBe(201);
    const planBody = planRes.body as HttpPlanningResultBody;
    expect(planBody.status).toBe('COMPLETED');
    expect(planBody.routes).toHaveLength(1);

    const plannedRoute = planBody.routes[0];
    expect(plannedRoute.stops).toHaveLength(1);
    const routeStopId = plannedRoute.stops[0].routeStopId;

    const stopInDb = await admin.routeStop.findUnique({
      where: { id: routeStopId },
    });

    expect(stopInDb).not.toBeNull();
    expect(stopInDb?.geocodingAttemptId).toBe(attemptId);

    const waypointRepo = app.get(PrismaRouteRoadWaypointRepository);
    const waypointsResult = await waypointRepo.resolveRouteWaypoints({
      tenantId: tenantA,
      routeId: plannedRoute.routeId,
      profile: 'MOTOR_VEHICLE',
    });
    expect(waypointsResult.kind).toBe('RESOLVED');
    if (waypointsResult.kind === 'RESOLVED') {
      expect(waypointsResult.datasetId).toBe(readyDatasetId);
      expect(waypointsResult.depotNodeId).toBeDefined();
      expect(waypointsResult.orderedStopNodeIds).toHaveLength(1);
    }
  });

  it('Scenario 11: serializes concurrent operations on different packages with identical operationId without conflict leaks', async () => {
    const sharedOperationId = randomUUID();

    const regRes1 = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-CONC-1-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 1.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });

    const regRes2 = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-CONC-2-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 1.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });

    const regBody1 = regRes1.body as HttpPackageBody;
    const regBody2 = regRes2.body as HttpPackageBody;
    const pkgId1 = regBody1.id;
    const pkgId2 = regBody2.id;

    const [res1, res2] = await Promise.all([
      request(server)
        .post(`/api/v1/packages/${pkgId1}/geocoding/resolve`)
        .set('Cookie', cookieCoordinatorA)
        .send({ operationId: sharedOperationId, forceRetry: true }),
      request(server)
        .post(`/api/v1/packages/${pkgId2}/geocoding/resolve`)
        .set('Cookie', cookieCoordinatorA)
        .send({ operationId: sharedOperationId, forceRetry: true }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
  });

  it('Scenario 12: rolls back all tables atomically when database trigger fails during package registration', async () => {
    const trackingCode = `TRK-FAIL-TRIGGER-${randomUUID().slice(0, 6)}`;
    const countsBefore = {
      packages: await admin.package.count({ where: { tenantId: tenantA } }),
      addresses: await admin.address.count({ where: { tenantId: tenantA } }),
      statusHistories: await admin.packageStatusHistory.count({
        where: { tenantId: tenantA },
      }),
      outboxEvents: await admin.outboxEvent.count({
        where: { tenantId: tenantA },
      }),
      attempts: await admin.geocodingAttempt.count({
        where: { tenantId: tenantA },
      }),
      candidates: await admin.geocodingCandidate.count({
        where: { tenantId: tenantA },
      }),
      attachments: await admin.networkAttachment.count({
        where: { tenantId: tenantA },
      }),
      auditLogs: await admin.auditLog.count({ where: { tenantId: tenantA } }),
    };

    await admin.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION fail_network_attachment_insert()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'Induced DB persistence failure on NetworkAttachment';
            END;
            $$ LANGUAGE plpgsql;
        `);

    await admin.$executeRawUnsafe(`
            CREATE TRIGGER trg_fail_network_attachment
            BEFORE INSERT ON "NetworkAttachment"
            FOR EACH ROW
            EXECUTE FUNCTION fail_network_attachment_insert();
        `);

    try {
      const failRes = await request(server)
        .post('/api/v1/packages')
        .set('Cookie', cookieCoordinatorA)
        .send({
          trackingCode,
          shipmentTypeId: shipmentTypeA,
          zoneId: zoneA,
          address: {
            text: 'Calle 80 # 53-67',
            municipalityCode: '08001',
          },
          weightKg: 2.0,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 10,
        });

      expect(failRes.status).toBe(500);

      const countsAfter = {
        packages: await admin.package.count({ where: { tenantId: tenantA } }),
        addresses: await admin.address.count({ where: { tenantId: tenantA } }),
        statusHistories: await admin.packageStatusHistory.count({
          where: { tenantId: tenantA },
        }),
        outboxEvents: await admin.outboxEvent.count({
          where: { tenantId: tenantA },
        }),
        attempts: await admin.geocodingAttempt.count({
          where: { tenantId: tenantA },
        }),
        candidates: await admin.geocodingCandidate.count({
          where: { tenantId: tenantA },
        }),
        attachments: await admin.networkAttachment.count({
          where: { tenantId: tenantA },
        }),
        auditLogs: await admin.auditLog.count({ where: { tenantId: tenantA } }),
      };

      expect(countsAfter.packages).toBe(countsBefore.packages);
      expect(countsAfter.addresses).toBe(countsBefore.addresses);
      expect(countsAfter.statusHistories).toBe(countsBefore.statusHistories);
      expect(countsAfter.outboxEvents).toBe(countsBefore.outboxEvents);
      expect(countsAfter.attempts).toBe(countsBefore.attempts);
      expect(countsAfter.candidates).toBe(countsBefore.candidates);
      expect(countsAfter.attachments).toBe(countsBefore.attachments);
      expect(countsAfter.auditLogs).toBe(countsBefore.auditLogs);

      const insertedPkg = await admin.package.findFirst({
        where: { tenantId: tenantA, trackingCode },
      });
      expect(insertedPkg).toBeNull();
    } finally {
      await admin.$executeRawUnsafe(`
                DROP TRIGGER IF EXISTS trg_fail_network_attachment ON "NetworkAttachment";
            `);
      await admin.$executeRawUnsafe(`
                DROP FUNCTION IF EXISTS fail_network_attachment_insert();
            `);
    }
  });

  it('Scenario 13: rejects invalid DTO bodies and non-UUID parameters with 400 Bad Request', async () => {
    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-DTO-VAL-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 1.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });
    expect(regRes.status).toBe(201);
    const validPackageId = (regRes.body as HttpPackageBody).id;

    const invalidUuidParamRes = await request(server)
      .post('/api/v1/packages/not-a-valid-uuid/geocoding/resolve')
      .set('Cookie', cookieCoordinatorA)
      .send({ forceRetry: false });
    expect(invalidUuidParamRes.status).toBe(400);

    const invalidReviewNumberReason = await request(server)
      .post(`/api/v1/packages/${validPackageId}/geocoding/review`)
      .set('Cookie', cookieCoordinatorA)
      .send({
        candidateId: randomUUID(),
        action: 'APPROVE',
        reason: 42,
      });
    expect(invalidReviewNumberReason.status).toBe(400);

    const invalidResolveBooleanString = await request(server)
      .post(`/api/v1/packages/${validPackageId}/geocoding/resolve`)
      .set('Cookie', cookieCoordinatorA)
      .send({
        forceRetry: 'yes',
      });
    expect(invalidResolveBooleanString.status).toBe(400);

    const emptyCorrectionBody = await request(server)
      .post(`/api/v1/packages/${validPackageId}/address-corrections`)
      .set('Cookie', cookieCoordinatorA)
      .send({});
    expect(emptyCorrectionBody.status).toBe(400);

    const emptyOperationIdResolve = await request(server)
      .post(`/api/v1/packages/${validPackageId}/geocoding/resolve`)
      .set('Cookie', cookieCoordinatorA)
      .send({ operationId: '   ' });
    expect(emptyOperationIdResolve.status).toBe(400);

    const invalidWorkspaceDataset = await request(server)
      .get('/api/v1/routes/planning/workspace?datasetId=invalid-uuid')
      .set('Cookie', cookieCoordinatorA);
    expect(invalidWorkspaceDataset.status).toBe(400);

    const invalidWorkspaceProfile = await request(server)
      .get('/api/v1/routes/planning/workspace?profile=SUBMARINE')
      .set('Cookie', cookieCoordinatorA);
    expect(invalidWorkspaceProfile.status).toBe(400);
  });

  it('Scenario 14: revalidates live geocoding eligibility and does not resurrect stale ELIGIBLE when dataset is disabled', async () => {
    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-STALE-CHECK-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 1.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });
    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    expect(regBody.geocoding.status).toBe('MATCHED');
    expect(regBody.geocoding.eligibility).toBe('ELIGIBLE');

    const getBefore = await request(server)
      .get(`/api/v1/packages/${packageId}`)
      .set('Cookie', cookieCoordinatorA);
    const getBeforeBody = getBefore.body as HttpPackageBody;
    expect(getBefore.status).toBe(200);
    expect(getBeforeBody.geocoding.eligibility).toBe('ELIGIBLE');

    await admin.geoDataset.update({
      where: { id: readyDatasetId },
      data: { status: 'STAGING' },
    });

    try {
      const getAfterDatasetStaging = await request(server)
        .get(`/api/v1/packages/${packageId}`)
        .set('Cookie', cookieCoordinatorA);
      const getAfterBody = getAfterDatasetStaging.body as HttpPackageBody;
      expect(getAfterDatasetStaging.status).toBe(200);
      expect(getAfterBody.geocoding.eligibility).toBe('INELIGIBLE');
      expect(getAfterBody.geocoding.status).toBe('DATASET_NOT_READY');
    } finally {
      await admin.geoDataset.update({
        where: { id: readyDatasetId },
        data: { status: 'READY' },
      });
    }
  });

  it('Scenario 15: preserves UNSUPPORTED_ADDRESS_FORMAT without geocodingAttempt on GET detail', async () => {
    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-UNSUPPORTED-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: {
          text: 'Texto de direccion no reconocible xyz 12345',
          municipalityCode: '08001',
        },
        weightKg: 1.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });
    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    expect(regBody.geocoding.status).toBe('UNSUPPORTED_ADDRESS_FORMAT');
    expect(regBody.geocoding.eligibility).toBe('INELIGIBLE');
    expect(regBody.geocoding.attemptId).toBeNull();

    const getRes = await request(server)
      .get(`/api/v1/packages/${packageId}`)
      .set('Cookie', cookieCoordinatorA);
    const getBody = getRes.body as HttpPackageBody;
    expect(getRes.status).toBe(200);
    expect(getBody.geocoding.status).toBe('UNSUPPORTED_ADDRESS_FORMAT');
    expect(getBody.geocoding.eligibility).toBe('INELIGIBLE');
    expect(getBody.geocoding.attemptId).toBeNull();
  });

  it('Scenario 16: package detail query selects configured MOTOR_VEHICLE attachment over other profiles on same candidate', async () => {
    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-REPLAN-MULTI-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 2.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });
    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    const candidateId = regBody.geocoding.selectedCandidateId;

    await admin.$executeRaw`
            INSERT INTO "NetworkAttachment" (
                "id", "tenantId", "datasetId", "geocodingCandidateId", "profile", "roadNodeId", "roadEdgeId", "snappedLocation", "accessDistanceM", "status"
            ) VALUES (
                gen_random_uuid(),
                ${tenantA}::uuid,
                ${readyDatasetId}::uuid,
                ${candidateId}::uuid,
                'FOOT'::"RoadProfile",
                ${roadNode1}::uuid,
                NULL,
                ST_SetSRID(ST_MakePoint(-74.8270, 11.0130), 4326),
                5.0,
                'AUTO_ACCEPTED'::"NetworkAttachmentStatus"
            )
        `;

    const getRes = await request(server)
      .get(`/api/v1/packages/${packageId}`)
      .set('Cookie', cookieCoordinatorA);
    const getBody = getRes.body as HttpPackageBody;
    expect(getRes.status).toBe(200);
    expect(getBody.geocoding.profile).toBe('MOTOR_VEHICLE');
    expect(getBody.geocoding.eligibility).toBe('ELIGIBLE');
  });

  it('Scenario 17: marks package INELIGIBLE when access distance exceeds municipality radius threshold', async () => {
    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-POL-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 2.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });
    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;
    const candidateId = regBody.geocoding.selectedCandidateId;

    await admin.$executeRaw`
            UPDATE "NetworkAttachment"
            SET "accessDistanceM" = 250.0
            WHERE "geocodingCandidateId" = ${candidateId}::uuid
              AND "profile" = 'MOTOR_VEHICLE'::"RoadProfile"
        `;

    const getRes = await request(server)
      .get(`/api/v1/packages/${packageId}`)
      .set('Cookie', cookieCoordinatorA);
    const getBody = getRes.body as HttpPackageBody;
    expect(getRes.status).toBe(200);
    expect(getBody.geocoding.eligibility).toBe('INELIGIBLE');
    expect(getBody.geocoding.status).toBe('NETWORK_ATTACHMENT_NOT_READY');
    expect(getBody.geocoding.unsuitabilityReason).toBe(
      'NETWORK_ATTACHMENT_NOT_READY',
    );
  });

  it('Scenario 18: returns INELIGIBLE and DATASET_NOT_READY when municipality target mapping is removed after registration', async () => {
    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-TARGET-NULL-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 2.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });
    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;

    const configAdapter = app.get(PackageGeocodingConfigAdapter);
    const spy = jest
      .spyOn(configAdapter, 'findTargetForMunicipality')
      .mockResolvedValueOnce(null);

    const getRes = await request(server)
      .get(`/api/v1/packages/${packageId}`)
      .set('Cookie', cookieCoordinatorA);
    spy.mockRestore();

    const getBody = getRes.body as HttpPackageBody;
    expect(getRes.status).toBe(200);
    expect(getBody.geocoding.eligibility).toBe('INELIGIBLE');
    expect(getBody.geocoding.status).toBe('DATASET_NOT_READY');
    expect(getBody.geocoding.unsuitabilityReason).toBe('DATASET_NOT_READY');
  });

  it('Scenario 19: returns INELIGIBLE and NETWORK_ATTACHMENT_NOT_READY when required profile changes without matching attachment', async () => {
    const regRes = await request(server)
      .post('/api/v1/packages')
      .set('Cookie', cookieCoordinatorA)
      .send({
        trackingCode: `TRK-PROF-MISMATCH-${randomUUID().slice(0, 6)}`,
        shipmentTypeId: shipmentTypeA,
        zoneId: zoneA,
        address: { text: 'Calle 80 # 53-67', municipalityCode: '08001' },
        weightKg: 2.0,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
      });
    expect(regRes.status).toBe(201);
    const regBody = regRes.body as HttpPackageBody;
    const packageId = regBody.id;

    const configAdapter = app.get(PackageGeocodingConfigAdapter);
    const spy = jest
      .spyOn(configAdapter, 'findTargetForMunicipality')
      .mockResolvedValueOnce({
        datasetId: readyDatasetId,
        profile: 'BICYCLE',
        maxAcceptanceRadiusMeters: 100,
        maxReviewRadiusMeters: 500,
      });

    const getRes = await request(server)
      .get(`/api/v1/packages/${packageId}`)
      .set('Cookie', cookieCoordinatorA);
    spy.mockRestore();

    const getBody = getRes.body as HttpPackageBody;
    expect(getRes.status).toBe(200);
    expect(getBody.geocoding.eligibility).toBe('INELIGIBLE');
    expect(getBody.geocoding.status).toBe('NETWORK_ATTACHMENT_NOT_READY');
    expect(getBody.geocoding.unsuitabilityReason).toBe(
      'NETWORK_ATTACHMENT_NOT_READY',
    );
  });
});
