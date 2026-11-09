export abstract class PackageDomainError extends Error {
    abstract readonly code: string;

    protected constructor(message: string) {
        super(message);
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class PackageNotFoundError extends PackageDomainError {
    readonly code = 'PACKAGE_NOT_FOUND';

    constructor(packageId: string) {
        super(`Package with id '${packageId}' was not found`);
    }
}

export class PackageStateConflictError extends PackageDomainError {
    readonly code = 'PACKAGE_STATE_CONFLICT';

    constructor(
        packageId: string,
        currentState: string,
        targetOperation: string,
    ) {
        super(
            `Package '${packageId}' is in state '${currentState}', which does not allow '${targetOperation}'`,
        );
    }
}

export class PackageActiveAssignmentConflictError extends PackageDomainError {
    readonly code = 'PACKAGE_ACTIVE_ASSIGNMENT_CONFLICT';

    constructor(packageId: string) {
        super(
            `Package '${packageId}' has an active route assignment and cannot be modified`,
        );
    }
}

export class PackageGeocodingReferenceMismatchError extends PackageDomainError {
    readonly code = 'PACKAGE_GEOCODING_REFERENCE_MISMATCH';

    constructor(
        packageId: string,
        referenceType: 'address' | 'geocodingAttempt',
        expected: string,
        actual: string | null,
    ) {
        super(
            `Package '${packageId}' reference mismatch for ${referenceType}: expected '${expected}', got '${actual ?? 'null'}'`,
        );
    }
}

export class PackageHistoricalAttemptLockedError extends PackageDomainError {
    readonly code = 'PACKAGE_HISTORICAL_ATTEMPT_LOCKED';

    constructor(attemptId: string) {
        super(
            `Geocoding attempt '${attemptId}' is referenced by a historical route stop and cannot be modified`,
        );
    }
}

export class PackageGeocodingValidationError extends PackageDomainError {
    readonly code = 'PACKAGE_GEOCODING_VALIDATION_ERROR';

    constructor(
        message: string,
        readonly field?: string,
    ) {
        super(message);
    }
}

export class PackageGeocodingCandidateNotFoundError extends PackageDomainError {
    readonly code = 'PACKAGE_GEOCODING_CANDIDATE_NOT_FOUND';

    constructor(candidateId: string, attemptId: string) {
        super(
            `Candidate '${candidateId}' was not found in geocoding attempt '${attemptId}'`,
        );
    }
}

export class PackageOperationIdConflictError extends PackageDomainError {
    readonly code = 'PACKAGE_OPERATION_ID_CONFLICT';

    constructor(operationId: string) {
        super(
            `Operation with id '${operationId}' has already been processed with a different payload`,
        );
    }
}

export class PackageOperationCorruptedError extends PackageDomainError {
    readonly code = 'PACKAGE_OPERATION_CORRUPTED';

    constructor(operationId: string) {
        super(
            `Operation '${operationId}' record in audit storage is corrupted or incomplete`,
        );
    }
}
