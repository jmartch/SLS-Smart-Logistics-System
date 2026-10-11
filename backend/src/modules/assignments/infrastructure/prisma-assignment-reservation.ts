import { Injectable } from '@nestjs/common';
import {
    AssignmentStatus,
    AssignmentType,
    Prisma,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
    AssignmentReservationRepository,
    AssignmentRoadProfile,
    AssignmentValidationCallback,
    ReservationRequest,
    ReservationResult,
    ValidatedReservationResult,
} from '../domain/reservation.repository';

/**
 * Prisma implementation of the atomic assignment reservation port.
 * The caller must obtain tenantId from trusted authentication or event context.
 */
@Injectable()
export class PrismaAssignmentReservation implements AssignmentReservationRepository {
    private static readonly MAX_ATTEMPTS = 5;

    constructor(private readonly prisma: PrismaService) {}

    async reserve(request: ReservationRequest): Promise<ReservationResult> {
        return this.withTransactionRetry(() =>
            this.reserveInTransaction(request),
        );
    }

    async reserveValidated(
        request: ReservationRequest,
        profile: AssignmentRoadProfile,
        validate: AssignmentValidationCallback,
    ): Promise<ValidatedReservationResult> {
        return this.withTransactionRetry(() =>
            this.reserveInTransaction(request, { profile, validate }),
        );
    }

    private async withTransactionRetry<T>(
        operation: () => Promise<T>,
    ): Promise<T> {
        for (
            let attempt = 0;
            attempt < PrismaAssignmentReservation.MAX_ATTEMPTS;
            attempt++
        ) {
            try {
                return await operation();
            } catch (error: unknown) {
                const lastAttempt =
                    attempt === PrismaAssignmentReservation.MAX_ATTEMPTS - 1;
                if (lastAttempt || !this.isRetryableTransactionError(error)) {
                    throw error;
                }
            }
        }

        throw new Error('RESERVATION_RETRY_EXHAUSTED');
    }

    private reserveInTransaction(
        request: ReservationRequest,
    ): Promise<ReservationResult>;
    private reserveInTransaction(
        request: ReservationRequest,
        validation: {
            readonly profile: AssignmentRoadProfile;
            readonly validate: AssignmentValidationCallback;
        },
    ): Promise<ValidatedReservationResult>;
    private reserveInTransaction(
        request: ReservationRequest,
        validation?: {
            readonly profile: AssignmentRoadProfile;
            readonly validate: AssignmentValidationCallback;
        },
    ): Promise<ValidatedReservationResult> {
        return this.prisma.$transaction(
            async (transaction) => {
                await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${request.tenantId}, true)`;

                // Prisma has no declarative FOR UPDATE API. Keep these small, typed lock
                // queries here and use Prisma Client for the remaining persistence work.
                const routes = await transaction.$queryRaw<
                    Array<{ vehicleId: string; courierId: string }>
                >`
                    SELECT "vehicleId", "courierId"
                    FROM "Route"
                    WHERE "tenantId" = ${request.tenantId}::uuid
                        AND id = ${request.routeId}::uuid
                    FOR UPDATE
                    `;

                const packages = await transaction.$queryRaw<
                    Array<{ id: string }>
                >`
                    SELECT id FROM "Package"
                    WHERE "tenantId" = ${request.tenantId}::uuid
                        AND id = ${request.packageId}::uuid
                    FOR UPDATE
                    `;

                const route = routes[0];

                if (!route || packages.length === 0) {
                    return { kind: 'NOT_FOUND' };
                }

                if (request.routeStopId) {
                    const routeStop = await transaction.routeStop.findFirst({
                        where: {
                            id: request.routeStopId,
                            routeId: request.routeId,
                            tenantId: request.tenantId,
                        },
                        select: { id: true },
                    });
                    if (!routeStop) return { kind: 'NOT_FOUND' };
                }

                if (request.responsibleUserId) {
                    const responsibleUser = await transaction.user.findFirst({
                        where: {
                            id: request.responsibleUserId,
                            tenantId: request.tenantId,
                        },
                        select: { id: true },
                    });
                    if (!responsibleUser) return { kind: 'NOT_FOUND' };
                }

                // Lock previous and target vehicles in a stable order on reassignment.
                await transaction.$queryRaw<Array<{ id: string }>>`
                    SELECT id FROM "Vehicle"
                    WHERE "tenantId" = ${request.tenantId}::uuid
                        AND (
                        id = ${route.vehicleId}::uuid
                        OR id IN (
                            SELECT "vehicleId" FROM "Assignment"
                            WHERE "tenantId" = ${request.tenantId}::uuid
                            AND "packageId" = ${request.packageId}::uuid
                            AND status = 'ACTIVE'
                        )
                        )
                    ORDER BY id FOR UPDATE
                    `;

                const [routeData, incomingPackage, activeAssignments] =
                    await Promise.all([
                        transaction.route.findFirst({
                            where: {
                                id: request.routeId,
                                tenantId: request.tenantId,
                            },
                            select: {
                                id: true,
                                state: true,
                                plannedStartAt: true,
                                plannedEndAt: true,
                                planningRequest: {
                                    select: { datasetId: true },
                                },
                                vehicle: {
                                    select: {
                                        id: true,
                                        tenantId: true,
                                        status: true,
                                        maxWeightKg: true,
                                        maxVolumeM3: true,
                                    },
                                },
                                courier: {
                                    select: {
                                        id: true,
                                        tenantId: true,
                                        status: true,
                                    },
                                },
                            },
                        }),
                        transaction.package.findFirst({
                            where: {
                                id: request.packageId,
                                tenantId: request.tenantId,
                            },
                            select: {
                                id: true,
                                tenantId: true,
                                state: true,
                                addressId: true,
                                zoneId: true,
                                weightKg: true,
                                volumeM3: true,
                                address: { select: { originalText: true } },
                                geocodingAttempt: {
                                    select: {
                                        id: true,
                                        tenantId: true,
                                        addressId: true,
                                        datasetId: true,
                                        selectedCandidateId: true,
                                        status: true,
                                        dataset: { select: { status: true } },
                                    },
                                },
                            },
                        }),
                        transaction.assignment.findMany({
                            where: {
                                tenantId: request.tenantId,
                                vehicleId: route.vehicleId,
                                status: AssignmentStatus.ACTIVE,
                                packageId: { not: request.packageId },
                            },
                            select: {
                                package: {
                                    select: { weightKg: true, volumeM3: true },
                                },
                            },
                        }),
                    ]);

                if (!routeData || !incomingPackage) {
                    return { kind: 'NOT_FOUND' };
                }

                const reserved = activeAssignments.reduce(
                    (total, assignment) => ({
                        weightKg: total.weightKg.add(
                            assignment.package.weightKg,
                        ),
                        volumeM3: total.volumeM3.add(
                            assignment.package.volumeM3,
                        ),
                    }),
                    {
                        weightKg: new Prisma.Decimal(0),
                        volumeM3: new Prisma.Decimal(0),
                    },
                );
                const remainingWeightKg = routeData.vehicle.maxWeightKg.sub(
                    reserved.weightKg,
                );
                const remainingVolumeM3 = routeData.vehicle.maxVolumeM3.sub(
                    reserved.volumeM3,
                );

                if (validation) {
                    const attempt = incomingPackage.geocodingAttempt;
                    const datasetId = routeData.planningRequest.datasetId;
                    const selectedCandidateId =
                        attempt?.selectedCandidateId ?? null;
                    const completeWindow =
                        routeData.plannedStartAt !== null &&
                        routeData.plannedEndAt !== null;
                    const [
                        coordinates,
                        attachment,
                        vehicleShift,
                        courierShift,
                        duplicate,
                        sourceAssignment,
                    ] = await Promise.all([
                        attempt && selectedCandidateId
                            ? transaction.$queryRaw<
                                  Array<{ latitude: number; longitude: number }>
                              >`
                                      SELECT
                                          ST_Y(location)::float8 AS latitude,
                                          ST_X(location)::float8 AS longitude
                                      FROM "GeocodingCandidate"
                                      WHERE "tenantId" = ${request.tenantId}::uuid
                                        AND id = ${selectedCandidateId}::uuid
                                        AND "attemptId" = ${attempt.id}::uuid
                                        AND "datasetId" = ${attempt.datasetId}::uuid
                                      `
                            : Promise.resolve([]),
                        datasetId && selectedCandidateId
                            ? transaction.networkAttachment.findFirst({
                                  where: {
                                      tenantId: request.tenantId,
                                      datasetId,
                                      geocodingCandidateId: selectedCandidateId,
                                      profile: validation.profile,
                                  },
                                  select: {
                                      tenantId: true,
                                      datasetId: true,
                                      geocodingCandidateId: true,
                                      profile: true,
                                      status: true,
                                      roadNodeId: true,
                                      roadEdgeId: true,
                                  },
                              })
                            : Promise.resolve(null),
                        completeWindow
                            ? transaction.vehicleShift.findFirst({
                                  where: {
                                      tenantId: request.tenantId,
                                      vehicleId: routeData.vehicle.id,
                                      startAt: {
                                          lte: routeData.plannedStartAt!,
                                      },
                                      endAt: { gte: routeData.plannedEndAt! },
                                  },
                                  select: { id: true },
                              })
                            : Promise.resolve({ id: 'no-window' }),
                        completeWindow
                            ? transaction.courierShift.findFirst({
                                  where: {
                                      tenantId: request.tenantId,
                                      courierId: routeData.courier.id,
                                      startAt: {
                                          lte: routeData.plannedStartAt!,
                                      },
                                      endAt: { gte: routeData.plannedEndAt! },
                                  },
                                  select: { id: true },
                              })
                            : Promise.resolve({ id: 'no-window' }),
                        transaction.assignment.findFirst({
                            where: {
                                tenantId: request.tenantId,
                                packageId: request.packageId,
                                routeId: request.routeId,
                                status: AssignmentStatus.ACTIVE,
                            },
                            select: { id: true },
                        }),
                        transaction.assignment.findFirst({
                            where: {
                                tenantId: request.tenantId,
                                packageId: request.packageId,
                                status: AssignmentStatus.ACTIVE,
                                routeId: { not: request.routeId },
                            },
                            select: {
                                routeId: true,
                                route: {
                                    select: { id: true, state: true },
                                },
                            },
                        }),
                    ]);

                    const coordinate = coordinates[0];
                    const result = validation.validate({
                        tenantId: request.tenantId,
                        hasDuplicateAssignment: duplicate !== null,
                        planning: {
                            datasetId: datasetId ?? '',
                            profile: validation.profile,
                        },
                        geocoding: attempt
                            ? {
                                  tenantId: attempt.tenantId,
                                  addressId: attempt.addressId,
                                  datasetId: attempt.datasetId,
                                  datasetStatus: attempt.dataset.status,
                                  status: attempt.status,
                                  selectedCandidateId,
                                  latitude: coordinate?.latitude ?? null,
                                  longitude: coordinate?.longitude ?? null,
                              }
                            : null,
                        networkAttachment: attachment
                            ? {
                                  ...attachment,
                                  profile: attachment.profile,
                                  status: attachment.status,
                              }
                            : null,
                        package: {
                            id: incomingPackage.id,
                            tenantId: incomingPackage.tenantId,
                            state: incomingPackage.state,
                            recipientAddress:
                                incomingPackage.address.originalText,
                            addressId: incomingPackage.addressId,
                            zoneId: incomingPackage.zoneId,
                            weightGrams: Math.round(incomingPackage.weightKg.toNumber() * 1000),
                            volumeCm3: Math.round(incomingPackage.volumeM3.toNumber() * 1000000),
                            weightKg: incomingPackage.weightKg.toNumber(),
                            volumeM3: incomingPackage.volumeM3.toNumber(),
                        },
                        vehicle: {
                            id: routeData.vehicle.id,
                            tenantId: routeData.vehicle.tenantId,
                            available:
                                routeData.vehicle.status === 'ACTIVE' &&
                                vehicleShift !== null,
                            remainingWeightGrams: Math.round(remainingWeightKg.toNumber() * 1000),
                            remainingVolumeCm3: Math.round(remainingVolumeM3.toNumber() * 1000000),
                            remainingWeightKg: remainingWeightKg.toNumber(),
                            remainingVolumeM3: remainingVolumeM3.toNumber(),
                        },
                        courier: {
                            id: routeData.courier.id,
                            tenantId: routeData.courier.tenantId,
                            available:
                                routeData.courier.status === 'ACTIVE' &&
                                courierShift !== null,
                        },
                        route: {
                            id: routeData.id,
                            status: routeData.state,
                        },
                        sourceRoute: sourceAssignment?.route
                            ? {
                                  id: sourceAssignment.route.id,
                                  status: sourceAssignment.route.state,
                              }
                            : null,
                    });

                    if (!result.ok) {
                        return {
                            kind: 'PENDING_ASSIGNMENT',
                            reason: result.code,
                            rejectedBy: result.handler,
                            message: result.message,
                        };
                    }
                }

                const fits =
                    reserved.weightKg
                        .add(incomingPackage.weightKg)
                        .lte(routeData.vehicle.maxWeightKg) &&
                    reserved.volumeM3
                        .add(incomingPackage.volumeM3)
                        .lte(routeData.vehicle.maxVolumeM3);

                if (!fits) {
                    return {
                        kind: 'PENDING_ASSIGNMENT',
                        reason: 'NO_CAPACITY',
                    };
                }

                const previous = await transaction.assignment.updateMany({
                    where: {
                        tenantId: request.tenantId,
                        packageId: request.packageId,
                        status: AssignmentStatus.ACTIVE,
                    },
                    data: {
                        status: AssignmentStatus.ENDED,
                        endedAt: new Date(),
                    },
                });
                const assignment = await transaction.assignment.create({
                    data: {
                        tenantId: request.tenantId,
                        packageId: request.packageId,
                        routeId: request.routeId,
                        routeStopId: request.routeStopId,
                        vehicleId: route.vehicleId,
                        courierId: route.courierId,
                        responsibleUserId: request.responsibleUserId,
                        assignmentType:
                            previous.count > 0
                                ? AssignmentType.REASSIGNMENT
                                : AssignmentType.INITIAL,
                    },
                    select: { id: true },
                });

                return { kind: 'ASSIGNED', assignmentId: assignment.id };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    }

    private isRetryableTransactionError(error: unknown): boolean {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034'
        ) {
            return true;
        }

        const code = (error as { code?: string }).code;
        return code === '40001' || code === '40P01';
    }
}
