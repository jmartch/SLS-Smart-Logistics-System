export type InvalidStopOrderingInputReason =
    | 'INVALID_TENANT_ID'
    | 'INVALID_CANDIDATES'
    | 'TENANT_MISMATCH'
    | 'INVALID_PACKAGE_ID'
    | 'DUPLICATE_PACKAGE_ID'
    | 'INVALID_ORIGIN'
    | 'MISSING_STOP_COORDINATES'
    | 'INVALID_STOP_COORDINATES'
    | 'INVALID_MAX_ITERATIONS'
    | 'INVALID_MIN_IMPROVEMENT'
    | 'INVALID_PROPOSAL'
    | 'PROPOSAL_PACKAGE_MISMATCH';

export class InvalidStopOrderingInputError extends Error {
    public readonly reason: InvalidStopOrderingInputReason;

    public constructor(reason: InvalidStopOrderingInputReason) {
        super(reason);
        this.name = 'InvalidStopOrderingInputError';
        this.reason = reason;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}