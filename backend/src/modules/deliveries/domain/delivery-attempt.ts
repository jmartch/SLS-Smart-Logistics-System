import {
  DeliveryValidationError,
  DeliveryEvidenceValidationError,
} from './delivery-errors';
import {
  DeliveryFailureReason,
  isValidDeliveryFailureReason,
} from './delivery-failure-reason';
import type { DeliveryEvidence } from './delivery-evidence';

export interface DeliveryAttemptProps {
  readonly id: string;
  readonly tenantId: string;
  readonly routeStopId: string;
  readonly packageId: string;
  readonly courierId: string;
  readonly assignmentId: string;
  readonly attemptNumber: number;
  readonly outcome: 'DELIVERED' | 'FAILED';
  readonly reasonCode?: DeliveryFailureReason | null;
  readonly notes?: string | null;
  readonly evidences: readonly DeliveryEvidence[];
  readonly attemptedAt: Date;
}

export class DeliveryAttempt {
  private constructor(private readonly props: DeliveryAttemptProps) {
    this.validateInvariants(props);
    Object.freeze(this.props.evidences);
    Object.freeze(this.props);
    Object.freeze(this);
  }

  static createSuccessful(
    props: Omit<DeliveryAttemptProps, 'outcome' | 'reasonCode'>,
  ): DeliveryAttempt {
    return new DeliveryAttempt({
      ...props,
      outcome: 'DELIVERED',
      reasonCode: null,
    });
  }

  static createFailed(props: CreateFailedAttemptProps): DeliveryAttempt {
    return new DeliveryAttempt({
      ...props,
      outcome: 'FAILED',
    });
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get routeStopId(): string {
    return this.props.routeStopId;
  }
  get packageId(): string {
    return this.props.packageId;
  }
  get courierId(): string {
    return this.props.courierId;
  }
  get assignmentId(): string {
    return this.props.assignmentId;
  }
  get attemptNumber(): number {
    return this.props.attemptNumber;
  }
  get outcome(): 'DELIVERED' | 'FAILED' {
    return this.props.outcome;
  }
  get reasonCode(): DeliveryFailureReason | null | undefined {
    return this.props.reasonCode;
  }
  get notes(): string | null | undefined {
    return this.props.notes;
  }
  get evidences(): readonly DeliveryEvidence[] {
    return this.props.evidences;
  }
  get attemptedAt(): Date {
    return this.props.attemptedAt;
  }

  private validateInvariants(props: DeliveryAttemptProps): void {
    if (props.attemptNumber < 1) {
      throw new DeliveryValidationError(
        'attemptNumber must be an integer greater than or equal to 1',
        'attemptNumber',
      );
    }

    if (props.outcome === 'DELIVERED') {
      if (props.reasonCode) {
        throw new DeliveryValidationError(
          'A successful delivery attempt (DELIVERED) cannot contain a reasonCode',
          'reasonCode',
        );
      }
      if (props.evidences.length === 0) {
        throw new DeliveryEvidenceValidationError(
          'A successful delivery attempt (DELIVERED) requires at least one evidence item (photo or signature)',
          'evidences',
        );
      }
    }

    if (props.outcome === 'FAILED') {
      if (
        !props.reasonCode ||
        !isValidDeliveryFailureReason(props.reasonCode)
      ) {
        throw new DeliveryValidationError(
          'A failed delivery attempt (FAILED) requires a valid reasonCode',
          'reasonCode',
        );
      }
      if (
        props.reasonCode === DeliveryFailureReason.OTHER &&
        (!props.notes || !props.notes.trim())
      ) {
        throw new DeliveryValidationError(
          'Failure reason "OTHER" requires descriptive notes',
          'notes',
        );
      }
    }

    if (props.notes && props.notes.trim().length > 1000) {
      throw new DeliveryValidationError(
        'Notes cannot exceed 1000 characters',
        'notes',
      );
    }
  }
}

export type CreateFailedAttemptProps = Omit<
  DeliveryAttemptProps,
  'outcome' | 'reasonCode'
> & {
  reasonCode: DeliveryFailureReason;
};
