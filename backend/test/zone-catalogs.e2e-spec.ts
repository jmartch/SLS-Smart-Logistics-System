import { randomUUID } from 'node:crypto';
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';

describe('Zone and catalog management E2E (ZONE-01)', () => {
  let app: INestApplication<App>;
  let server: any;

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  beforeAll(async () => {
    await admin.$connect();

    await admin.tenant.createMany({
      data: [
        {
          id: tenantAId,
          name: `Zone E2E Tenant A ${tenantAId}`,
          slug: `zone-e2e-a-${tenantAId}`,
        },
        {
          id: tenantBId,
          name: `Zone E2E Tenant B ${tenantBId}`,
          slug: `zone-e2e-b-${tenantBId}`,
        },
      ],
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    try {
      await admin.sector.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await admin.zone.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await admin.shipmentType.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await admin.tenant.deleteMany({
        where: { id: { in: [tenantAId, tenantBId] } },
      });
    } finally {
      await admin.$disconnect();
      if (app) {
        await app.close();
      }
    }
  });

  describe('Tenant security and context extraction', () => {
    it('rejects unauthenticated requests without tenant header', async () => {
      const response = await request(server).get('/api/v1/zones');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('rejects requests with malformed tenant header', async () => {
      const response = await request(server)
        .get('/api/v1/zones')
        .set('x-tenant-id', 'invalid-not-a-uuid');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });
  });

  describe('Zone management and multi-tenant isolation', () => {
    let zoneAId: string;

    it('creates a new zone for Tenant A', async () => {
      const response = await request(server)
        .post('/api/v1/zones')
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'ZN-NORTH',
          name: 'Zona Norte',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantAId,
        code: 'ZN-NORTH',
        name: 'Zona Norte',
      });
      expect(response.body.id).toBeDefined();

      zoneAId = response.body.id;
    });

    it('allows Tenant B to create a zone with the same code', async () => {
      const response = await request(server)
        .post('/api/v1/zones')
        .set('x-tenant-id', tenantBId)
        .send({
          code: 'ZN-NORTH',
          name: 'Zona Norte Tenant B',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantBId,
        code: 'ZN-NORTH',
        name: 'Zona Norte Tenant B',
      });
    });

    it('rejects duplicate zone code within the same tenant', async () => {
      const response = await request(server)
        .post('/api/v1/zones')
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'ZN-NORTH',
          name: 'Zona Norte Duplicada',
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'CATALOG_CODE_CONFLICT',
      });
    });

    it('rejects invalid zone format according to domain rules', async () => {
      const response = await request(server)
        .post('/api/v1/zones')
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'zn with spaces and lowercase',
          name: 'Zona Invalida',
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('lists only Tenant A zones for Tenant A requests', async () => {
      const response = await request(server)
        .get('/api/v1/zones')
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].code).toBe('ZN-NORTH');
      expect(response.body[0].tenantId).toBe(tenantAId);
    });

    it('retrieves zone detail when requested by owning tenant', async () => {
      const response = await request(server)
        .get(`/api/v1/zones/${zoneAId}`)
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: zoneAId,
        code: 'ZN-NORTH',
        tenantId: tenantAId,
      });
    });

    it('returns 404 when Tenant B attempts to retrieve Tenant A zone', async () => {
      const response = await request(server)
        .get(`/api/v1/zones/${zoneAId}`)
        .set('x-tenant-id', tenantBId);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'CATALOG_RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('Sector management and zone hierarchy', () => {
    let zoneAId: string;
    let sectorAId: string;

    beforeAll(async () => {
      const zone = await admin.zone.create({
        data: {
          tenantId: tenantAId,
          code: 'ZN-SOUTH',
          name: 'Zona Sur',
        },
      });
      zoneAId = zone.id;
    });

    it('creates a sector inside an existing zone', async () => {
      const response = await request(server)
        .post(`/api/v1/zones/${zoneAId}/sectors`)
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'SEC-SOUTH-1',
          name: 'Sector Sur 1',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantAId,
        zoneId: zoneAId,
        code: 'SEC-SOUTH-1',
        name: 'Sector Sur 1',
      });
      expect(response.body.id).toBeDefined();

      sectorAId = response.body.id;
    });

    it('rejects duplicate sector code within the same zone', async () => {
      const response = await request(server)
        .post(`/api/v1/zones/${zoneAId}/sectors`)
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'SEC-SOUTH-1',
          name: 'Sector Sur Repetido',
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'CATALOG_CODE_CONFLICT',
      });
    });

    it('rejects sector creation when parent zone does not belong to tenant', async () => {
      const response = await request(server)
        .post(`/api/v1/zones/${zoneAId}/sectors`)
        .set('x-tenant-id', tenantBId)
        .send({
          code: 'SEC-SOUTH-B',
          name: 'Sector Sur Tenant B',
        });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'CATALOG_RESOURCE_NOT_FOUND',
      });
    });

    it('lists sectors belonging to the zone', async () => {
      const response = await request(server)
        .get(`/api/v1/zones/${zoneAId}/sectors`)
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(sectorAId);
    });

    it('returns 404 when listing sectors of another tenant zone', async () => {
      const response = await request(server)
        .get(`/api/v1/zones/${zoneAId}/sectors`)
        .set('x-tenant-id', tenantBId);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'CATALOG_RESOURCE_NOT_FOUND',
      });
    });

    it('retrieves sector detail by zone and sector IDs', async () => {
      const response = await request(server)
        .get(`/api/v1/zones/${zoneAId}/sectors/${sectorAId}`)
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: sectorAId,
        zoneId: zoneAId,
        code: 'SEC-SOUTH-1',
      });
    });

    it('returns 404 when sector ID does not belong to the queried zone', async () => {
      const anotherZone = await admin.zone.create({
        data: {
          tenantId: tenantAId,
          code: 'ZN-WEST',
          name: 'Zona Oeste',
        },
      });

      const response = await request(server)
        .get(`/api/v1/zones/${anotherZone.id}/sectors/${sectorAId}`)
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'CATALOG_RESOURCE_NOT_FOUND',
      });
    });
  });

  describe('Shipment type catalog and active filtering', () => {
    let activeTypeId: string;
    let inactiveTypeId: string;

    it('creates active shipment type by default', async () => {
      const response = await request(server)
        .post('/api/v1/shipment-types')
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'EXPRESS',
          name: 'Envío Express',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantAId,
        code: 'EXPRESS',
        name: 'Envío Express',
        active: true,
      });

      activeTypeId = response.body.id;
    });

    it('creates inactive shipment type when explicitly requested', async () => {
      const response = await request(server)
        .post('/api/v1/shipment-types')
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'SAME_DAY',
          name: 'Envío Mismo Día',
          active: false,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantAId,
        code: 'SAME_DAY',
        active: false,
      });

      inactiveTypeId = response.body.id;
    });

    it('rejects duplicate shipment type code for the same tenant', async () => {
      const response = await request(server)
        .post('/api/v1/shipment-types')
        .set('x-tenant-id', tenantAId)
        .send({
          code: 'EXPRESS',
          name: 'Otro Express',
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'CATALOG_CODE_CONFLICT',
      });
    });

    it('lists only active shipment types by default', async () => {
      const response = await request(server)
        .get('/api/v1/shipment-types')
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(activeTypeId);
      expect(response.body[0].code).toBe('EXPRESS');
    });

    it('lists both active and inactive shipment types when includeInactive=true', async () => {
      const response = await request(server)
        .get('/api/v1/shipment-types?includeInactive=true')
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);

      const codes = response.body.map((item: any) => item.code);
      expect(codes).toContain('EXPRESS');
      expect(codes).toContain('SAME_DAY');
    });

    it('retrieves shipment type detail by id', async () => {
      const response = await request(server)
        .get(`/api/v1/shipment-types/${activeTypeId}`)
        .set('x-tenant-id', tenantAId);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: activeTypeId,
        code: 'EXPRESS',
      });
    });

    it('returns 404 when Tenant B requests Tenant A shipment type', async () => {
      const response = await request(server)
        .get(`/api/v1/shipment-types/${activeTypeId}`)
        .set('x-tenant-id', tenantBId);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'CATALOG_RESOURCE_NOT_FOUND',
      });
    });
  });
});
