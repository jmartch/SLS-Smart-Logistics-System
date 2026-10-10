import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { GeocodeAddressService } from '../src/modules/geocoding/application/geocode-address.service';
import { PrismaGeocodingAddress } from '../src/modules/geocoding/infrastructure/prisma-geocoding-address';
import { PrismaGeocodingAttempt } from '../src/modules/geocoding/infrastructure/prisma-geocoding-attempt';
import { PrismaGeocodingCatalog } from '../src/modules/geocoding/infrastructure/prisma-geocoding-catalog';

interface CoordinateRow {
    readonly latitude: number;
    readonly longitude: number;
}

describe('GEOCODE-01 integration', () => {
    const admin = new PrismaClient({
        adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL,
        }),
    });

    const app = new PrismaService();

    const tenantId = randomUUID();
    const addressId = randomUUID();
    const datasetId = randomUUID();
    const referenceId = randomUUID();
    const tenantBId = randomUUID();
    const noMatchAddressId = randomUUID();
    const stagingDatasetId = randomUUID();
    const ambiguousAddressId = randomUUID();
    const rollbackAddressId = randomUUID();

    const ambiguousReferenceIds = [
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
    ] as const;

    let service: GeocodeAddressService;

    beforeAll(async () => {
        for (const variable of [
            'DATABASE_URL',
            'RUNTIME_DATABASE_URL',
        ] as const) {
            const connectionString = process.env[variable];

            if (!connectionString) {
                throw new Error(`${variable} is required`);
            }

            const databasePath = new URL(connectionString).pathname;

            if (!/^\/sls_geocode01_[0-9a-f]{32}$/.test(databasePath)) {
                throw new Error(
                    `${variable} must point to a disposable sls_geocode01_* database`,
                );
            }
        }

        await admin.$connect();
        await app.$connect();

        service = new GeocodeAddressService(
            new PrismaGeocodingAddress(app),
            new PrismaGeocodingCatalog(app),
            new PrismaGeocodingAttempt(app),
        );

        await admin.tenant.createMany({
            data: [
                {
                    id: tenantId,
                    name: `GEOCODE-01 tenant A ${tenantId}`,
                    slug: `geocode-01-a-${tenantId}`,
                    status: 'ACTIVE',
                },
                {
                    id: tenantBId,
                    name: `GEOCODE-01 tenant B ${tenantBId}`,
                    slug: `geocode-01-b-${tenantBId}`,
                    status: 'ACTIVE',
                },
            ],
        });

        await admin.address.createMany({
            data: [
                {
                    id: addressId,
                    tenantId,
                    originalText: 'Calle 80 # 53-67',
                    municipalityCode: '08001',
                },
                {
                    id: noMatchAddressId,
                    tenantId,
                    originalText: 'Calle 90 # 10-20',
                    municipalityCode: '08001',
                },
                {
                    id: ambiguousAddressId,
                    tenantId,
                    originalText: 'Carrera 53 # 80-67',
                    municipalityCode: '08001',
                },
                {
                    id: rollbackAddressId,
                    tenantId,
                    originalText: 'Calle 80 # 53-67',
                    municipalityCode: '08001',
                },
            ],
        });

        await admin.geoDataset.create({
            data: {
                id: datasetId,
                name: 'GEOCODE-01 synthetic dataset',
                sourceType: 'SYNTHETIC',
                sourceReference: 'geocode-01-fixture',
                sourceDate: new Date(),
                checksum: 'a'.repeat(64),
                license: 'Synthetic test data',
                coverage: 'Barranquilla',
                importerVersion: 'geocode-e2e-v1',
                status: 'READY',
                readyAt: new Date(),
            },
        });

        await admin.geoDataset.create({
            data: {
                id: stagingDatasetId,
                name: 'GEOCODE-01 staging dataset',
                sourceType: 'SYNTHETIC',
                sourceReference: 'geocode-01-staging-fixture',
                sourceDate: new Date(),
                checksum: 'b'.repeat(64),
                license: 'Synthetic test data',
                coverage: 'Barranquilla',
                importerVersion: 'geocode-e2e-v1',
                status: 'STAGING',
            },
        });

        await admin.$executeRaw`
            INSERT INTO "AddressReference" (
                "id",
                "datasetId",
                "sourceRecordId",
                "municipalityCode",
                "streetType",
                "streetIdentifier",
                "generatingRoad",
                "plateNumber",
                "neighborhood",
                "normalizedAddress",
                "searchKey",
                "location",
                "precision"
            )
            VALUES (
                ${referenceId}::uuid,
                ${datasetId}::uuid,
                ${`reference-${referenceId}`},
                '08001',
                'CALLE',
                '80',
                '53',
                '67',
                NULL,
                'CALLE 80 # 53-67',
                'CALLE|80|53|67',
                ST_SetSRID(ST_MakePoint(-74.8271, 11.0132), 4326),
                'ENTRANCE'
            )
        `;

        await admin.$executeRaw`
            INSERT INTO "AddressReference" (
                "id",
                "datasetId",
                "sourceRecordId",
                "municipalityCode",
                "streetType",
                "streetIdentifier",
                "generatingRoad",
                "plateNumber",
                "neighborhood",
                "normalizedAddress",
                "searchKey",
                "location",
                "precision"
            )
            VALUES
            (
                ${ambiguousReferenceIds[0]}::uuid,
                ${datasetId}::uuid,
                'ambiguous-reference-1',
                '08001',
                'CARRERA',
                '53',
                '80',
                '67',
                NULL,
                'CARRERA 53 # 80-67',
                'CARRERA|53|80|67',
                ST_SetSRID(ST_MakePoint(-74.8101, 11.0101), 4326),
                'ENTRANCE'
            ),
            (
                ${ambiguousReferenceIds[1]}::uuid,
                ${datasetId}::uuid,
                'ambiguous-reference-2',
                '08001',
                'CARRERA',
                '53',
                '80',
                '67',
                NULL,
                'CARRERA 53 # 80-67',
                'CARRERA|53|80|67',
                ST_SetSRID(ST_MakePoint(-74.8102, 11.0102), 4326),
                'ENTRANCE'
            )
        `;
    });

    afterAll(async () => {
        await app.$disconnect();
        await admin.$disconnect();
    });

    it('persists an exact match with coordinates in the correct order', async () => {
        const result = await service.execute({
            tenantId,
            addressId,
            datasetId,
        });

        expect(result.kind).toBe('COMPLETED');

        if (result.kind !== 'COMPLETED') {
            throw new Error(`Unexpected result: ${result.kind}`);
        }

        expect(result.decision).toMatchObject({
            status: 'MATCHED',
            selectedReferenceId: referenceId,
        });

        const attempt = await admin.geocodingAttempt.findUniqueOrThrow({
            where: {
                id: result.attemptId,
            },
            select: {
                tenantId: true,
                addressId: true,
                datasetId: true,
                normalizedText: true,
                algorithmVersion: true,
                status: true,
                selectedCandidateId: true,
            },
        });

        expect(attempt).toMatchObject({
            tenantId,
            addressId,
            datasetId,
            normalizedText: 'CALLE 80 # 53-67',
            algorithmVersion: 'geocode-v1',
            status: 'MATCHED',
        });

        expect(attempt.selectedCandidateId).not.toBeNull();

        const candidates = await admin.geocodingCandidate.findMany({
            where: {
                tenantId,
                attemptId: result.attemptId,
            },
            select: {
                id: true,
                addressReferenceId: true,
                rank: true,
                score: true,
                source: true,
                precision: true,
            },
        });

        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
            id: attempt.selectedCandidateId,
            addressReferenceId: referenceId,
            rank: 1,
            source: 'LOCAL_CATALOG',
            precision: 'ENTRANCE',
        });
        expect(candidates[0].score.toNumber()).toBe(1);

        const coordinates = await admin.$queryRaw<CoordinateRow[]>`
            SELECT
                ST_Y("location")::float8 AS latitude,
                ST_X("location")::float8 AS longitude
            FROM "GeocodingCandidate"
            WHERE "tenantId" = ${tenantId}::uuid
                AND "attemptId" = ${result.attemptId}::uuid
        `;

        expect(coordinates).toEqual([
            {
                latitude: 11.0132,
                longitude: -74.8271,
            },
        ]);
    });

    it('persists NOT_FOUND without candidates', async () => {
        const result = await service.execute({
            tenantId,
            addressId: noMatchAddressId,
            datasetId,
        });

        expect(result.kind).toBe('COMPLETED');

        if (result.kind !== 'COMPLETED') {
            throw new Error(`Unexpected result: ${result.kind}`);
        }

        expect(result.decision).toMatchObject({
            status: 'NOT_FOUND',
            selectedReferenceId: null,
            candidates: [],
        });

        const attempt = await admin.geocodingAttempt.findUniqueOrThrow({
            where: {
                id: result.attemptId,
            },
            select: {
                tenantId: true,
                addressId: true,
                datasetId: true,
                status: true,
                selectedCandidateId: true,
            },
        });

        expect(attempt).toEqual({
            tenantId,
            addressId: noMatchAddressId,
            datasetId,
            status: 'NOT_FOUND',
            selectedCandidateId: null,
        });

        expect(
            await admin.geocodingCandidate.count({
                where: {
                    tenantId,
                    attemptId: result.attemptId,
                },
            }),
        ).toBe(0);
    });

    it('does not persist an attempt for a STAGING dataset', async () => {
        const before = await admin.geocodingAttempt.count({
            where: {
                tenantId,
                addressId,
                datasetId: stagingDatasetId,
            },
        });

        const result = await service.execute({
            tenantId,
            addressId,
            datasetId: stagingDatasetId,
        });

        expect(result).toEqual({
            kind: 'DATASET_NOT_READY',
        });

        const after = await admin.geocodingAttempt.count({
            where: {
                tenantId,
                addressId,
                datasetId: stagingDatasetId,
            },
        });

        expect(after).toBe(before);
    });

    it('does not expose a foreign tenant address', async () => {
        const before = await admin.geocodingAttempt.count({
            where: {
                tenantId,
                addressId,
                datasetId,
            },
        });

        const result = await service.execute({
            tenantId: tenantBId,
            addressId,
            datasetId,
        });

        expect(result).toEqual({
            kind: 'ADDRESS_NOT_FOUND',
        });

        const after = await admin.geocodingAttempt.count({
            where: {
                tenantId,
                addressId,
                datasetId,
            },
        });

        expect(after).toBe(before);
    });

    it('persists ambiguous candidates as REVIEW_REQUIRED', async () => {
        const result = await service.execute({
            tenantId,
            addressId: ambiguousAddressId,
            datasetId,
        });

        expect(result.kind).toBe('COMPLETED');

        if (result.kind !== 'COMPLETED') {
            throw new Error(`Unexpected result: ${result.kind}`);
        }

        expect(result.decision.status).toBe('REVIEW_REQUIRED');
        expect(result.decision.selectedReferenceId).toBeNull();

        expect(
            result.decision.candidates.map((candidate) => ({
                referenceId: candidate.referenceId,
                rank: candidate.rank,
                score: candidate.score,
            })),
        ).toEqual([
            {
                referenceId: ambiguousReferenceIds[0],
                rank: 1,
                score: 1,
            },
            {
                referenceId: ambiguousReferenceIds[1],
                rank: 2,
                score: 1,
            },
        ]);

        const attempt = await admin.geocodingAttempt.findUniqueOrThrow({
            where: {
                id: result.attemptId,
            },
            select: {
                tenantId: true,
                addressId: true,
                datasetId: true,
                status: true,
                selectedCandidateId: true,
            },
        });

        expect(attempt).toEqual({
            tenantId,
            addressId: ambiguousAddressId,
            datasetId,
            status: 'REVIEW_REQUIRED',
            selectedCandidateId: null,
        });

        const candidates = await admin.geocodingCandidate.findMany({
            where: {
                tenantId,
                attemptId: result.attemptId,
            },
            orderBy: {
                rank: 'asc',
            },
            select: {
                addressReferenceId: true,
                rank: true,
                score: true,
            },
        });

        expect(
            candidates.map((candidate) => ({
                referenceId: candidate.addressReferenceId,
                rank: candidate.rank,
                score: candidate.score.toNumber(),
            })),
        ).toEqual([
            {
                referenceId: ambiguousReferenceIds[0],
                rank: 1,
                score: 1,
            },
            {
                referenceId: ambiguousReferenceIds[1],
                rank: 2,
                score: 1,
            },
        ]);
    });

    it('rolls back the attempt when candidate persistence fails', async () => {
        const attemptsBefore = await admin.geocodingAttempt.count({
            where: {
                tenantId,
                addressId: rollbackAddressId,
                datasetId,
            },
        });

        const candidatesBefore = await admin.geocodingCandidate.count({
            where: {
                tenantId,
            },
        });

        await admin.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION geocode01_force_candidate_failure()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RAISE EXCEPTION 'GEOCODE01_FORCED_CANDIDATE_FAILURE';
            END;
            $$;
        `);

        try {
            await admin.$executeRawUnsafe(`
                CREATE TRIGGER geocode01_force_candidate_failure_trigger
                BEFORE INSERT ON "GeocodingCandidate"
                FOR EACH ROW
                EXECUTE FUNCTION geocode01_force_candidate_failure();
            `);

            await expect(
                service.execute({
                    tenantId,
                    addressId: rollbackAddressId,
                    datasetId,
                }),
            ).rejects.toThrow('GEOCODE01_FORCED_CANDIDATE_FAILURE');
        } finally {
            await admin.$executeRawUnsafe(`
                DROP TRIGGER IF EXISTS geocode01_force_candidate_failure_trigger
                ON "GeocodingCandidate";
            `);

            await admin.$executeRawUnsafe(`
                DROP FUNCTION IF EXISTS geocode01_force_candidate_failure();
            `);
        }

        const attemptsAfter = await admin.geocodingAttempt.count({
            where: {
                tenantId,
                addressId: rollbackAddressId,
                datasetId,
            },
        });

        const candidatesAfter = await admin.geocodingCandidate.count({
            where: {
                tenantId,
            },
        });

        expect(attemptsBefore).toBe(0);
        expect(attemptsAfter).toBe(attemptsBefore);
        expect(candidatesAfter).toBe(candidatesBefore);
    });
});
