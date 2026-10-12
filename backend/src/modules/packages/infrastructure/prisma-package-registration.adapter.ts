import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
    PackageReferenceQuery,
    PackageRegistrationPort,
    RegisterPackageOutcome,
} from '../application/ports/package-registration.port';
import type { PackageRegistrationData } from '../domain/package-registration';
import type { PackageReferenceSnapshot } from '../domain/package-reference.policy';

@Injectable()
export class PrismaPackageRegistrationAdapter implements PackageRegistrationPort {
    constructor(private readonly prisma: PrismaService) {}

    async loadReferences(
        tenantId: string,
        query: PackageReferenceQuery,
    ): Promise<PackageReferenceSnapshot> {
        return runWithTenant(this.prisma, tenantId, async (tx) => {
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
        });
    }

    async registerByTenant(
        tenantId: string,
        data: PackageRegistrationData,
        publicTrackingToken: string,
    ): Promise<RegisterPackageOutcome> {
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

                    // Historial inicial en la misma transacción que el paquete.
                    await tx.packageStatusHistory.create({
                        data: {
                            tenantId,
                            packageId: registered.id,
                            fromState: null,
                            toState: data.initialState,
                            reasonCode: 'PACKAGE_REGISTERED',
                            changedByUserId: null,
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
                error.code === 'P2002' &&
                (await this.trackingCodeExists(tenantId, data.trackingCode))
            ) {
                return { ok: false, code: 'PACKAGE_TRACKING_CODE_CONFLICT' };
            }

            throw error;
        }
    }

    // Tras un P2002 la transacción ya hizo rollback; se confirma en una nueva
    // lectura que el conflicto es del código de seguimiento y no del token.
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
