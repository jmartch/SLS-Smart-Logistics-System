import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { PackageRegistrationContext } from '../application/ports/package-registration.port';
import { parsePackageRegistration } from '../domain/package-registration';
import { PrismaPackageRegistrationAdapter } from '../infrastructure/prisma-package-registration.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const CORRELATION_ID = '30000000-0000-4000-8000-000000000001';
const SHIPMENT_TYPE_ID = '50000000-0000-4000-8000-000000000001';
const ZONE_ID = '60000000-0000-4000-8000-000000000001';
const SECTOR_ID = '70000000-0000-4000-8000-000000000001';
const ADDRESS_ID = '80000000-0000-4000-8000-000000000001';
const PACKAGE_ID = '90000000-0000-4000-8000-000000000001';

const context: PackageRegistrationContext = {
    tenantId: TENANT_ID,
    actorUserId: USER_ID,
    correlationId: CORRELATION_ID,
};

function createFixture() {
    const mocks = {
        executeRawUnsafe: jest.fn().mockResolvedValue(1),
        shipmentTypeFindFirst: jest.fn(),
        zoneFindFirst: jest.fn(),
        sectorFindFirst: jest.fn(),
        addressCreate: jest.fn(),
        packageCreate: jest.fn(),
        packageFindFirst: jest.fn(),
        historyCreate: jest.fn(),
        outboxCreate: jest.fn(),
    };
    const transaction = {
        $executeRawUnsafe: mocks.executeRawUnsafe,
        shipmentType: { findFirst: mocks.shipmentTypeFindFirst },
        zone: { findFirst: mocks.zoneFindFirst },
        sector: { findFirst: mocks.sectorFindFirst },
        address: { create: mocks.addressCreate },
        package: {
            create: mocks.packageCreate,
            findFirst: mocks.packageFindFirst,
        },
        packageStatusHistory: { create: mocks.historyCreate },
        outboxEvent: { create: mocks.outboxCreate },
    };
    const prisma = {
        $transaction: jest.fn(
            async (callback: (tx: typeof transaction) => Promise<unknown>) =>
                callback(transaction),
        ),
    } as unknown as PrismaService;

    return { ...mocks, adapter: new PrismaPackageRegistrationAdapter(prisma) };
}

const data = parsePackageRegistration({
    trackingCode: 'PKG-0001',
    address: { text: 'Calle 72 # 45-10', municipalityCode: '08001' },
    shipmentTypeId: SHIPMENT_TYPE_ID,
    zoneId: ZONE_ID,
    sectorId: SECTOR_ID,
    weightKg: 2.5,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
    priority: 'HIGH',
    deadline: '2026-10-20T17:00:00Z',
    serviceDurationSeconds: 300,
});

const createdRow = {
    id: PACKAGE_ID,
    tenantId: TENANT_ID,
    trackingCode: 'PKG-0001',
    publicTrackingToken: 'token-publico',
    state: 'REGISTERED',
    addressId: ADDRESS_ID,
    shipmentTypeId: SHIPMENT_TYPE_ID,
    zoneId: ZONE_ID,
    sectorId: SECTOR_ID,
    weightKg: new Prisma.Decimal('2.5'),
    lengthCm: new Prisma.Decimal('30'),
    widthCm: new Prisma.Decimal('20'),
    heightCm: new Prisma.Decimal('10'),
    volumeM3: new Prisma.Decimal('0.006'),
    priority: 'HIGH',
    deadline: new Date('2026-10-20T17:00:00Z'),
    serviceDurationSeconds: 300,
};

describe('PrismaPackageRegistrationAdapter', () => {
    describe('loadReferences', () => {
        it('queries every reference scoped to the tenant', async () => {
            const f = createFixture();
            f.shipmentTypeFindFirst.mockResolvedValue({ active: true });
            f.zoneFindFirst.mockResolvedValue({ id: ZONE_ID });
            f.sectorFindFirst.mockResolvedValue({ zoneId: ZONE_ID });

            const result = await f.adapter.loadReferences(TENANT_ID, {
                shipmentTypeId: SHIPMENT_TYPE_ID,
                zoneId: ZONE_ID,
                sectorId: SECTOR_ID,
            });

            expect(f.executeRawUnsafe).toHaveBeenCalledWith(
                `SET LOCAL app.tenant_id = '${TENANT_ID}'`,
            );
            expect(f.shipmentTypeFindFirst).toHaveBeenCalledWith({
                where: { tenantId: TENANT_ID, id: SHIPMENT_TYPE_ID },
                select: { active: true },
            });
            expect(f.zoneFindFirst).toHaveBeenCalledWith({
                where: { tenantId: TENANT_ID, id: ZONE_ID },
                select: { id: true },
            });
            expect(f.sectorFindFirst).toHaveBeenCalledWith({
                where: { tenantId: TENANT_ID, id: SECTOR_ID },
                select: { zoneId: true },
            });
            expect(result).toEqual({
                shipmentType: { active: true },
                zone: { id: ZONE_ID },
                sector: { zoneId: ZONE_ID },
            });
        });

        it('does not query zone or sector when none was requested', async () => {
            const f = createFixture();
            f.shipmentTypeFindFirst.mockResolvedValue(null);

            const result = await f.adapter.loadReferences(TENANT_ID, {
                shipmentTypeId: SHIPMENT_TYPE_ID,
                zoneId: null,
                sectorId: null,
            });

            expect(f.zoneFindFirst).not.toHaveBeenCalled();
            expect(f.sectorFindFirst).not.toHaveBeenCalled();
            expect(result).toEqual({
                shipmentType: null,
                zone: null,
                sector: null,
            });
        });
    });

    describe('registerByTenant', () => {
        it('creates address, package, history with changedByUserId and PackageRegistered outbox event in one transaction', async () => {
            const f = createFixture();
            f.addressCreate.mockResolvedValue({ id: ADDRESS_ID });
            f.packageCreate.mockResolvedValue(createdRow);
            f.historyCreate.mockResolvedValue({});
            f.outboxCreate.mockResolvedValue({});

            const result = await f.adapter.registerByTenant(
                context,
                data,
                'token-publico',
            );

            expect(f.addressCreate).toHaveBeenCalledWith({
                data: {
                    tenantId: TENANT_ID,
                    originalText: 'Calle 72 # 45-10',
                    municipalityCode: '08001',
                },
                select: { id: true },
            });
            expect(f.packageCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        tenantId: TENANT_ID,
                        addressId: ADDRESS_ID,
                        trackingCode: 'PKG-0001',
                        publicTrackingToken: 'token-publico',
                        state: 'REGISTERED',
                        weightKg: '2.5',
                        volumeM3: '0.006',
                        priority: 'HIGH',
                    }) as unknown,
                }),
            );
            expect(f.historyCreate).toHaveBeenCalledWith({
                data: {
                    tenantId: TENANT_ID,
                    packageId: PACKAGE_ID,
                    fromState: null,
                    toState: 'REGISTERED',
                    reasonCode: 'PACKAGE_REGISTERED',
                    changedByUserId: USER_ID,
                },
            });
            expect(f.outboxCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    eventId: expect.any(String) as unknown,
                    tenantId: TENANT_ID,
                    correlationId: CORRELATION_ID,
                    eventType: 'PackageRegistered',
                    occurredAt: expect.any(Date) as unknown,
                    producer: 'sls-backend.packages',
                    version: 1,
                    payload: {
                        producer: 'sls-backend.packages',
                        packageId: PACKAGE_ID,
                        fromState: null,
                        toState: 'REGISTERED',
                        changedByUserId: USER_ID,
                        reasonCode: 'PACKAGE_REGISTERED',
                    },
                }) as unknown,
            });
            expect(f.addressCreate.mock.invocationCallOrder[0]).toBeLessThan(
                f.packageCreate.mock.invocationCallOrder[0],
            );
            expect(f.packageCreate.mock.invocationCallOrder[0]).toBeLessThan(
                f.historyCreate.mock.invocationCallOrder[0],
            );
            expect(f.historyCreate.mock.invocationCallOrder[0]).toBeLessThan(
                f.outboxCreate.mock.invocationCallOrder[0],
            );
            expect(result).toMatchObject({
                ok: true,
                package: {
                    id: PACKAGE_ID,
                    state: 'REGISTERED',
                    weightKg: '2.5',
                    volumeM3: '0.006',
                    publicTrackingToken: 'token-publico',
                },
            });
        });

        it('does not report success when a later write fails', async () => {
            const f = createFixture();
            f.addressCreate.mockResolvedValue({ id: ADDRESS_ID });
            f.packageCreate.mockResolvedValue(createdRow);
            const failure = new Error('history write failed');
            f.historyCreate.mockRejectedValue(failure);

            await expect(
                f.adapter.registerByTenant(context, data, 'token-publico'),
            ).rejects.toBe(failure);
            expect(f.outboxCreate).not.toHaveBeenCalled();
        });

        it('translates P2002 into a tracking code conflict when the code already exists', async () => {
            const f = createFixture();
            f.addressCreate.mockResolvedValue({ id: ADDRESS_ID });
            f.packageCreate.mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError(
                    'Unique constraint failed',
                    {
                        code: 'P2002',
                        clientVersion: '7.10.0',
                    },
                ),
            );
            f.packageFindFirst.mockResolvedValue({ id: PACKAGE_ID });

            await expect(
                f.adapter.registerByTenant(context, data, 'token-publico'),
            ).resolves.toEqual({
                ok: false,
                code: 'PACKAGE_TRACKING_CODE_CONFLICT',
            });
            expect(f.packageFindFirst).toHaveBeenCalledWith({
                where: { tenantId: TENANT_ID, trackingCode: 'PKG-0001' },
                select: { id: true },
            });
        });

        it('rethrows P2002 when it is not a tracking code conflict (e.g. token collision)', async () => {
            const f = createFixture();
            f.addressCreate.mockResolvedValue({ id: ADDRESS_ID });
            const conflict = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed',
                {
                    code: 'P2002',
                    clientVersion: '7.10.0',
                },
            );
            f.packageCreate.mockRejectedValue(conflict);
            f.packageFindFirst.mockResolvedValue(null);

            await expect(
                f.adapter.registerByTenant(context, data, 'token-publico'),
            ).rejects.toBe(conflict);
        });

        it('propagates any other error unchanged', async () => {
            const f = createFixture();
            const failure = new Error('Database server connection lost');
            f.addressCreate.mockRejectedValue(failure);

            await expect(
                f.adapter.registerByTenant(context, data, 'token-publico'),
            ).rejects.toBe(failure);
        });
    });

    describe('registerInTx', () => {
        it('returns PACKAGE_TRACKING_CODE_CONFLICT when P2002 target targets trackingCode', async () => {
            const f = createFixture();
            const tx = {
                address: {
                    create: jest.fn().mockResolvedValue({ id: ADDRESS_ID }),
                },
                package: {
                    create: jest.fn().mockRejectedValue(
                        new Prisma.PrismaClientKnownRequestError(
                            'Unique constraint failed',
                            {
                                code: 'P2002',
                                clientVersion: '7.10.0',
                                meta: { target: ['tenantId', 'trackingCode'] },
                            },
                        ),
                    ),
                },
                packageStatusHistory: { create: jest.fn() },
                outboxEvent: { create: jest.fn() },
            } as unknown as Prisma.TransactionClient;

            const res = await f.adapter.registerInTx(
                tx,
                context,
                data,
                'token-123',
            );
            expect(res).toEqual({
                ok: false,
                code: 'PACKAGE_TRACKING_CODE_CONFLICT',
            });
        });

        it('rethrows P2002 when target targets publicTrackingToken', async () => {
            const f = createFixture();
            const tokenConflict = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed',
                {
                    code: 'P2002',
                    clientVersion: '7.10.0',
                    meta: { target: ['publicTrackingToken'] },
                },
            );
            const tx = {
                address: {
                    create: jest.fn().mockResolvedValue({ id: ADDRESS_ID }),
                },
                package: {
                    create: jest.fn().mockRejectedValue(tokenConflict),
                },
                packageStatusHistory: { create: jest.fn() },
                outboxEvent: { create: jest.fn() },
            } as unknown as Prisma.TransactionClient;

            await expect(
                f.adapter.registerInTx(tx, context, data, 'colliding-token'),
            ).rejects.toBe(tokenConflict);
        });
    });
});
