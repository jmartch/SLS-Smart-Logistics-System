import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from './validation.types';

export type AssignmentRoadProfile =
    AssignmentValidationContext['planning']['profile'];

export interface ReservationRequest {
    readonly tenantId: string;
    readonly packageId: string;
    readonly routeId: string;
    readonly routeStopId?: string;
    readonly responsibleUserId?: string;
}

export type ReservationResult =
    | { readonly kind: 'ASSIGNED'; readonly assignmentId: string }
    | { readonly kind: 'PENDING_ASSIGNMENT'; readonly reason: 'NO_CAPACITY' }
    | { readonly kind: 'NOT_FOUND' };

export type AssignmentValidationCallback = (
    context: AssignmentValidationContext,
) => AssignmentValidationResult;

export type ValidatedReservationResult =
    | ReservationResult
    | {
          readonly kind: 'PENDING_ASSIGNMENT';
          readonly reason: Exclude<
              AssignmentValidationResult,
              { readonly ok: true }
          >['code'];
          readonly rejectedBy: string;
          readonly message: string;
      };

export abstract class AssignmentReservationRepository {
    abstract reserve(request: ReservationRequest): Promise<ReservationResult>;

    abstract reserveValidated(
        request: ReservationRequest,
        profile: AssignmentRoadProfile,
        validate: AssignmentValidationCallback,
    ): Promise<ValidatedReservationResult>;
}
