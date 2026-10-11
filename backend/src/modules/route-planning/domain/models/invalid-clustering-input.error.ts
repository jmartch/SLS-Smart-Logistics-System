export type InvalidClusteringInputReason =
    | 'TENANT_MISMATCH'
    | 'DUPLICATE_PACKAGE_ID'
    | 'DUPLICATE_VEHICLE_ID'
    | 'INVALID_RADIUS'
    | 'INVALID_QUANTITY_FORMAT'
    | 'NEGATIVE_QUANTITY'
    | 'INTEGER_OVERFLOW';

const ERROR_MESSAGES: Readonly<Record<InvalidClusteringInputReason, string>> = {
    TENANT_MISMATCH: 'All packages and vehicles must belong to the specified tenant.',
    DUPLICATE_PACKAGE_ID: 'Duplicate package ID detected in input.',
    DUPLICATE_VEHICLE_ID: 'Duplicate vehicle ID detected in input.',
    INVALID_RADIUS: 'Radius must be a finite, positive number of meters.',
    INVALID_QUANTITY_FORMAT: 'Quantity string must be a canonical decimal number with allowed scale.',
    NEGATIVE_QUANTITY: 'Quantities must be non-negative, and package weight/volume must be positive.',
    INTEGER_OVERFLOW: 'Quantity calculation exceeded safe integer range.',
};

export class InvalidClusteringInputError extends Error {
    public readonly reason: InvalidClusteringInputReason;

    public constructor(
        reason: InvalidClusteringInputReason,
        message: string = ERROR_MESSAGES[reason],
    ) {
        super(message);
        this.name = 'InvalidClusteringInputError';
        this.reason = reason;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}