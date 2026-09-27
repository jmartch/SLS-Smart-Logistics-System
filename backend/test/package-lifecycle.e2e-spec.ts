import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { TransitionPackageStateService } from '../src/modules/packages/application/transition-package-state.service';
import { InvalidPackageTransitionError } from '../src/modules/packages/domain/invalid-package-transition.error';
import { PrismaPackageLifecycleRepository } from '../src/modules/packages/infrastructure/prisma-package-lifecycle.repository';

interface OutboxRow {
    readonly eventType: string;
    readonly status: string;
    readonly payload: {
        readonly producer: string;
        readonly packageId: string;
        readonly fromState: string;
        readonly toState: string;
        readonly changedByUserId: string | null;
        readonly reasonCode: string | null;
    };
}

describe('Persistencia integral del ciclo de paquetes GDB-06', () => {
    const admin = new PrismaClient({
        adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL,
        }),
    });

    const app = new PrismaService();

    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const userAId = randomUUID();
    const userBId = randomUUID();
    const addressAId = randomUUID();
    const addressBId = randomUUID();
    const shipmentTypeAId = randomUUID();
    const shipmentTypeBId = randomUUID();

    let service: TransitionPackageStateService;

    beforeAll(async () => {
        for (const variable of [
            'DATABASE_URL',
            'RUNTIME_DATABASE_URL',
        ] as const) {
            const connectionString = process.env[variable];

            if (!connectionString) {
                throw new Error(`${variable} is required`);
            }

            const databaseName = new URL(connectionString).pathname;

            if (!databaseName.startsWith('/sls_gdb06_')) {
                throw new Error(
                    `${variable} must point to a disposable sls_gdb06_* database`,
                );
            }
        }

        await admin.$connect();
        await app.$connect();

        service = new TransitionPackageStateService(
            new PrismaPackageLifecycleRepository(app),
        );

        await admin.tenant.createMany({
            data: [
                {
                    id: tenantAId,
                    name: `GDB-06 tenant A ${tenantAId}`,
                },
                {
                    id: tenantBId,
                    name: `GDB-06 tenant B ${tenantBId}`,
                },
            ],
        });

        await admin.user.createMany({
            data: [
                {
                    id: userAId,
                    tenantId: tenantAId,
                    email: `${userAId}@example.test`,
                    passwordHash: 'not-a-real-password',
                },
                {
                    id: userBId,
                    tenantId: tenantBId,
                    email: `${userBId}@example.test`,
                    passwordHash: 'not-a-real-password',
                },
            ],
        });

        await admin.address.createMany({
            data: [
                {
                    id: addressAId,
                    tenantId: tenantAId,
                    originalText: 'GDB-06 address A',
                    municipalityCode: '08001',
                },
                {
                    id: addressBId,
                    tenantId: tenantBId,
                    originalText: 'GDB-06 address B',
                    municipalityCode: '08001',
                },
            ],
        });

        await admin.shipmentType.createMany({
            data: [
                {
                    id: shipmentTypeAId,
                    tenantId: tenantAId,
                    code: 'GDB06-A',
                    name: 'GDB-06 shipment A',
                },
                {
                    id: shipmentTypeBId,
                    tenantId: tenantBId,
                    code: 'GDB06-B',
                    name: 'GDB-06 shipment B',
                },
            ],
        });
    });

    afterAll(async () => {
        await app.$disconnect();
        await admin.$disconnect();
    });

    async function createPackage(
        tenantId: string,
        addressId: string,
        shipmentTypeId: string,
        state: 'REGISTERED' | 'CLASSIFIED',
    ): Promise<string> {
        const packageId = randomUUID();

        await admin.package.create({
            data: {
                id: packageId,
                tenantId,
                addressId,
                shipmentTypeId,
                trackingCode: `GDB06-${packageId}`,
                publicTrackingToken: randomUUID(),
                state,
                weightKg: '1',
                lengthCm: '10',
                widthCm: '10',
                heightCm: '10',
                volumeM3: '0.001',
            },
        });

        return packageId;
    }

    async function readOutbox(
        tenantId: string,
        packageId: string,
    ): Promise<OutboxRow[]> {
        return admin.$queryRaw<OutboxRow[]>`
            SELECT
                "eventType",
                status,
                payload
            FROM "OutboxEvent"
            WHERE "tenantId" = ${tenantId}::uuid
              AND payload ->> 'packageId' = ${packageId}
        `;
    }

    it('updates state and writes history and outbox atomically', async () => {
        const packageId = await createPackage(
            tenantAId,
            addressAId,
            shipmentTypeAId,
            'CLASSIFIED',
        );
        const correlationId = randomUUID();

        const result = await service.execute({
            tenantId: tenantAId,
            packageId,
            targetState: 'ASSIGNED_TO_ROUTE',
            changedByUserId: userAId,
            reasonCode: 'ROUTE_ASSIGNED',
            correlationId,
        });

        expect(result.kind).toBe('TRANSITIONED');

        const storedPackage = await admin.package.findUniqueOrThrow({
            where: { id: packageId },
            select: { state: true },
        });

        const history = await admin.packageStatusHistory.findMany({
            where: {
                tenantId: tenantAId,
                packageId,
            },
        });

        const outbox = await readOutbox(tenantAId, packageId);

        expect(storedPackage.state).toBe('ASSIGNED_TO_ROUTE');
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
            fromState: 'CLASSIFIED',
            toState: 'ASSIGNED_TO_ROUTE',
            changedByUserId: userAId,
            reasonCode: 'ROUTE_ASSIGNED',
        });
        expect(outbox).toEqual([
            {
                eventType: 'PackageAssigned',
                status: 'PENDING',
                payload: {
                    producer: 'sls-backend.packages',
                    packageId,
                    fromState: 'CLASSIFIED',
                    toState: 'ASSIGNED_TO_ROUTE',
                    changedByUserId: userAId,
                    reasonCode: 'ROUTE_ASSIGNED',
                },
            },
        ]);
    });

    it('does not write when the domain transition is invalid', async () => {
        const packageId = await createPackage(
            tenantAId,
            addressAId,
            shipmentTypeAId,
            'REGISTERED',
        );

        await expect(
            service.execute({
                tenantId: tenantAId,
                packageId,
                targetState: 'DELIVERED',
            }),
        ).rejects.toBeInstanceOf(InvalidPackageTransitionError);

        const storedPackage = await admin.package.findUniqueOrThrow({
            where: { id: packageId },
            select: { state: true },
        });

        const historyCount = await admin.packageStatusHistory.count({
            where: { tenantId: tenantAId, packageId },
        });

        expect(storedPackage.state).toBe('REGISTERED');
        expect(historyCount).toBe(0);
        expect(await readOutbox(tenantAId, packageId)).toEqual([]);
    });

    it('rolls back the state when history persistence fails', async () => {
        const packageId = await createPackage(
            tenantAId,
            addressAId,
            shipmentTypeAId,
            'CLASSIFIED',
        );

        await expect(
            service.execute({
                tenantId: tenantAId,
                packageId,
                targetState: 'ASSIGNED_TO_ROUTE',
                changedByUserId: userBId,
                reasonCode: 'FOREIGN_USER',
            }),
        ).rejects.toBeDefined();

        const storedPackage = await admin.package.findUniqueOrThrow({
            where: { id: packageId },
            select: { state: true },
        });

        const historyCount = await admin.packageStatusHistory.count({
            where: { tenantId: tenantAId, packageId },
        });

        expect(storedPackage.state).toBe('CLASSIFIED');
        expect(historyCount).toBe(0);
        expect(await readOutbox(tenantAId, packageId)).toEqual([]);
    });

    it('does not expose another tenant package', async () => {
        const packageId = await createPackage(
            tenantAId,
            addressAId,
            shipmentTypeAId,
            'CLASSIFIED',
        );

        const result = await service.execute({
            tenantId: tenantBId,
            packageId,
            targetState: 'ASSIGNED_TO_ROUTE',
            changedByUserId: userBId,
        });

        expect(result).toEqual({ kind: 'NOT_FOUND' });

        const storedPackage = await admin.package.findUniqueOrThrow({
            where: { id: packageId },
            select: { state: true },
        });

        expect(storedPackage.state).toBe('CLASSIFIED');
        expect(
            await admin.packageStatusHistory.count({
                where: { packageId },
            }),
        ).toBe(0);
        expect(await readOutbox(tenantAId, packageId)).toEqual([]);
    });
});