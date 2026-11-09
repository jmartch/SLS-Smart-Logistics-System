import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
    isValidTenantId,
    runWithTenant,
} from '../../../database/run-with-tenant';
import type {
    PackageReferenceQuery,
    PackageRegistrationContext,
    PackageRegistrationPort,
    RegisterPackageOutcome,
} from '../application/ports/package-registration.port';
import { PackageEventType } from '../domain/events/package-state-changed.event';
import type { PackageRegistrationData } from '../domain/package-registration';
import type { PackageReferenceSnapshot } from '../domain/package-reference.policy';

@Injectable()
export class PrismaPackageRegistrationAdapter implements PackageRegistrationPort {
    constructor(private readonly prisma: PrismaService) {}

    async loadReferences(
        tenantId: string,
        query: PackageReferenceQuery,
    ): Promise<PackageReferenceSnapshot> {
        return runWithTenant(this.prisma, tenantId, (tx) =>
            this.loadReferencesInTx(tx, tenantId, query),
        );
    }

    async loadReferencesInTx(
        tx: Prisma.TransactionClient,
        tenantId: string,
        query: PackageReferenceQuery,
    ): Promise<PackageReferenceSnapshot> {
        const shipmentType = await tx.shipmentType.findFirst({
            where: { tenantId, id: query.shipmentTypeId },
            select: { active: true },
        });

        const zone =
            query.zoneId === null
                ? null
                : await tx.zone.findFirst({
                      where: { tenantId, id: query.zoneId },
                      select: { id: true },
                  });

        const sector =
            query.sectorId === null
                ? null
                : await tx.sector.findFirst({
                      where: { tenantId, id: query.sectorId },
                      select: { zoneId: true },
                  });

        return { shipmentType, zone, sector };
    }

    async registerByTenant(
        context: PackageRegistrationContext,
        data: PackageRegistrationData,
        publicTrackingToken: string,
    ): Promise<RegisterPackageOutcome> {
        const { tenantId, actorUserId } = context;
        const eventId = randomUUID();
        const correlationId =
            context.correlationId && isValidTenantId(context.correlationId)
                ? context.correlationId
                : eventId;
        const occurredAt = new Date();

        try {
            const created = await runWithTenant(
                this.prisma,
                tenantId,
                async (tx) => {
                    const address = await tx.address.create({
                        data: {
                            tenantId,
                            originalText: data.addressText,
                            municipalityCode: data.municipalityCode,
                        },
                        select: { id: true },
                    });

                    const registered = await tx.package.create({
                        data: {
                            tenantId,
                            addressId: address.id,
                            shipmentTypeId: data.shipmentTypeId,
                            zoneId: data.zoneId,
                            sectorId: data.sectorId,
                            trackingCode: data.trackingCode,
                            publicTrackingToken,
                            state: data.initialState,
                            weightKg: data.weightKg,
                            lengthCm: data.lengthCm,
                            widthCm: data.widthCm,
                            heightCm: data.heightCm,
                            volumeM3: data.volumeM3,
                            priority: data.priority,
                            deadline: data.deadline,
                            serviceDurationSeconds: data.serviceDurationSeconds,
                        },
                        select: {
                            id: true,
                            tenantId: true,
                            trackingCode: true,
                            publicTrackingToken: true,
                            state: true,
                            addressId: true,
                            shipmentTypeId: true,
                            zoneId: true,
                            sectorId: true,
                            weightKg: true,
                            lengthCm: true,
                            widthCm: true,
                            heightCm: true,
                            volumeM3: true,
                            priority: true,
                            deadline: true,
                            serviceDurationSeconds: true,
                        },
                    });

                    await tx.packageStatusHistory.create({
                        data: {
                            tenantId,
                            packageId: registered.id,
                            fromState: null,
                            toState: data.initialState,
                            reasonCode: 'PACKAGE_REGISTERED',
                            changedByUserId: actorUserId,
                        },
                    });

                    await tx.outboxEvent.create({
                        data: {
                            tenantId,
                            eventId,
                            correlationId,
                            eventType: PackageEventType.REGISTERED,
                            version: 1,
                            occurredAt,
                            producer: 'sls-backend.packages',
                            payload: {
                                producer: 'sls-backend.packages',
                                packageId: registered.id,
                                fromState: null,
                                toState: data.initialState,
                                changedByUserId: actorUserId,
                                reasonCode: 'PACKAGE_REGISTERED',
                            },
                        },
                    });

                    return registered;
                },
            );

            return {
                ok: true,
                package: {
                    id: created.id,
                    tenantId: created.tenantId,
                    trackingCode: created.trackingCode,
                    publicTrackingToken: created.publicTrackingToken,
                    state: created.state,
                    addressId: created.addressId,
                    shipmentTypeId: created.shipmentTypeId,
                    zoneId: created.zoneId,
                    sectorId: created.sectorId,
                    weightKg: String(created.weightKg),
                    lengthCm: String(created.lengthCm),
                    widthCm: String(created.widthCm),
                    heightCm: String(created.heightCm),
                    volumeM3: String(created.volumeM3),
                    priority: created.priority,
                    deadline: created.deadline,
                    serviceDurationSeconds: created.serviceDurationSeconds,
                },
            };
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const target = error.meta?.target;
                const isTrackingCodeTarget = Array.isArray(target)
                    ? target.includes('trackingCode')
                    : typeof target === 'string' &&
                      (target.includes('trackingCode') ||
                          target.includes('Package_tenantId_trackingCode_key'));

                const isTokenTarget = Array.isArray(target)
                    ? target.includes('publicTrackingToken')
                    : typeof target === 'string' &&
                      (target.includes('publicTrackingToken') ||
                          target.includes('Package_publicTrackingToken_key'));

                if (isTrackingCodeTarget) {
                    return {
                        ok: false,
                        code: 'PACKAGE_TRACKING_CODE_CONFLICT',
                    };
                }
                if (
                    !isTokenTarget &&
                    (await this.trackingCodeExists(tenantId, data.trackingCode))
                ) {
                    return {
                        ok: false,
                        code: 'PACKAGE_TRACKING_CODE_CONFLICT',
                    };
                }
            }

            throw error;
        }
    }

    async registerInTx(
        tx: Prisma.TransactionClient,
        context: PackageRegistrationContext,
        data: PackageRegistrationData,
        publicTrackingToken: string,
    ): Promise<RegisterPackageOutcome> {
        const { tenantId, actorUserId } = context;
        const eventId = randomUUID();
        const correlationId =
            context.correlationId && isValidTenantId(context.correlationId)
                ? context.correlationId
                : eventId;
        const occurredAt = new Date();

        try {
            const address = await tx.address.create({
                data: {
                    tenantId,
                    originalText: data.addressText,
                    municipalityCode: data.municipalityCode,
                },
                select: { id: true },
            });

            const registered = await tx.package.create({
                data: {
                    tenantId,
                    addressId: address.id,
                    shipmentTypeId: data.shipmentTypeId,
                    zoneId: data.zoneId,
                    sectorId: data.sectorId,
                    trackingCode: data.trackingCode,
                    publicTrackingToken,
                    state: data.initialState,
                    weightKg: data.weightKg,
                    lengthCm: data.lengthCm,
                    widthCm: data.widthCm,
                    heightCm: data.heightCm,
                    volumeM3: data.volumeM3,
                    priority: data.priority,
                    deadline: data.deadline,
                    serviceDurationSeconds: data.serviceDurationSeconds,
                },
                select: {
                    id: true,
                    tenantId: true,
                    trackingCode: true,
                    publicTrackingToken: true,
                    state: true,
                    addressId: true,
                    shipmentTypeId: true,
                    zoneId: true,
                    sectorId: true,
                    weightKg: true,
                    lengthCm: true,
                    widthCm: true,
                    heightCm: true,
                    volumeM3: true,
                    priority: true,
                    deadline: true,
                    serviceDurationSeconds: true,
                },
            });

            await tx.packageStatusHistory.create({
                data: {
                    tenantId,
                    packageId: registered.id,
                    fromState: null,
                    toState: data.initialState,
                    reasonCode: 'PACKAGE_REGISTERED',
                    changedByUserId: actorUserId,
                },
            });

            await tx.outboxEvent.create({
                data: {
                    tenantId,
                    eventId,
                    correlationId,
                    eventType: PackageEventType.REGISTERED,
                    version: 1,
                    occurredAt,
                    producer: 'sls-backend.packages',
                    payload: {
                        producer: 'sls-backend.packages',
                        packageId: registered.id,
                        fromState: null,
                        toState: data.initialState,
                        changedByUserId: actorUserId,
                        reasonCode: 'PACKAGE_REGISTERED',
                    },
                },
            });

            return {
                ok: true,
                package: {
                    id: registered.id,
                    tenantId: registered.tenantId,
                    trackingCode: registered.trackingCode,
                    publicTrackingToken: registered.publicTrackingToken,
                    state: registered.state,
                    addressId: registered.addressId,
                    shipmentTypeId: registered.shipmentTypeId,
                    zoneId: registered.zoneId,
                    sectorId: registered.sectorId,
                    weightKg: String(registered.weightKg),
                    lengthCm: String(registered.lengthCm),
                    widthCm: String(registered.widthCm),
                    heightCm: String(registered.heightCm),
                    volumeM3: String(registered.volumeM3),
                    priority: registered.priority,
                    deadline: registered.deadline,
                    serviceDurationSeconds: registered.serviceDurationSeconds,
                },
            };
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                const target = error.meta?.target;
                const isTrackingCodeTarget = Array.isArray(target)
                    ? target.includes('trackingCode')
                    : typeof target === 'string' &&
                      (target.includes('trackingCode') ||
                          target.includes('Package_tenantId_trackingCode_key'));

                if (isTrackingCodeTarget) {
                    return {
                        ok: false,
                        code: 'PACKAGE_TRACKING_CODE_CONFLICT',
                    };
                }
            }

            throw error;
        }
    }

    private async trackingCodeExists(
        tenantId: string,
        trackingCode: string,
    ): Promise<boolean> {
        const existing = await runWithTenant(this.prisma, tenantId, (tx) =>
            tx.package.findFirst({
                where: { tenantId, trackingCode },
                select: { id: true },
            }),
        );

        return existing !== null;
    }
}
