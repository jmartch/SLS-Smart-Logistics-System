import { createAssignmentValidationChain } from '../domain/validation.chain';
import {
    AssignmentRoadProfile,
    AssignmentReservationRepository,
    ValidatedReservationResult,
} from '../domain/reservation.repository';

export interface AssignPackageToRouteCommand {
    // tenantId must come from authenticated identity or trusted event metadata.
    readonly tenantId: string;
    readonly packageId: string;
    readonly routeId: string;
    readonly profile: AssignmentRoadProfile;
    readonly routeStopId?: string;
    readonly responsibleUserId?: string;
}

export type AssignPackageToRouteResult = ValidatedReservationResult;

export class AssignPackageToRouteService {
    constructor(
        private readonly reservationRepository: AssignmentReservationRepository,
    ) {}

    execute(
        command: AssignPackageToRouteCommand,
    ): Promise<AssignPackageToRouteResult> {
        const chain = createAssignmentValidationChain();
        return this.reservationRepository.reserveValidated(
            {
                tenantId: command.tenantId,
                packageId: command.packageId,
                routeId: command.routeId,
                routeStopId: command.routeStopId,
                responsibleUserId: command.responsibleUserId,
            },
            command.profile,
            (context) => chain.handle(context),
        );
    }
}
