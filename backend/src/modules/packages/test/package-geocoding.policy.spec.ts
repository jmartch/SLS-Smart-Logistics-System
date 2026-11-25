import {
    PackageActiveAssignmentConflictError,
    PackageGeocodingReferenceMismatchError,
    PackageGeocodingValidationError,
    PackageHistoricalAttemptLockedError,
    PackageStateConflictError,
} from '../domain/package-errors';
import { PackageGeocodingPolicy } from '../domain/package-geocoding.policy';

describe('PackageGeocodingPolicy', () => {
    const packageId = 'pkg-001';

    describe('validateOperationAllowedState', () => {
        it.each(['REGISTERED', 'CLASSIFIED', 'PENDING_ASSIGNMENT'])(
            'allows operation when state is %s',
            (state) => {
                expect(() =>
                    PackageGeocodingPolicy.validateOperationAllowedState(
                        packageId,
                        state,
                        'resolve geocoding',
                    ),
                ).not.toThrow();
            },
        );

        it.each([
            'ASSIGNED_TO_ROUTE',
            'READY_FOR_DISPATCH',
            'IN_TRANSIT',
            'OUT_FOR_DELIVERY',
            'DELIVERED',
            'CANCELLED',
        ])('rejects operation when state is %s', (state) => {
            expect(() =>
                PackageGeocodingPolicy.validateOperationAllowedState(
                    packageId,
                    state,
                    'resolve geocoding',
                ),
            ).toThrow(PackageStateConflictError);
        });
    });

    describe('validateNoActiveAssignment', () => {
        it('allows operation when there is no active assignment', () => {
            expect(() =>
                PackageGeocodingPolicy.validateNoActiveAssignment(
                    packageId,
                    false,
                ),
            ).not.toThrow();
        });

        it('throws PackageActiveAssignmentConflictError when assignment is active', () => {
            expect(() =>
                PackageGeocodingPolicy.validateNoActiveAssignment(
                    packageId,
                    true,
                ),
            ).toThrow(PackageActiveAssignmentConflictError);
        });
    });

    describe('validateAddressReference', () => {
        it('allows operation when address reference matches', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAddressReference(
                    packageId,
                    'addr-1',
                    'addr-1',
                ),
            ).not.toThrow();
        });

        it('throws PackageGeocodingReferenceMismatchError when address reference differs', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAddressReference(
                    packageId,
                    'addr-1',
                    'addr-2',
                ),
            ).toThrow(PackageGeocodingReferenceMismatchError);
        });
    });

    describe('validateAttemptReference', () => {
        it('allows operation when expected attempt matches actual attempt', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAttemptReference(
                    packageId,
                    'attempt-1',
                    'attempt-1',
                ),
            ).not.toThrow();
        });

        it('allows operation when expected attempt is undefined regardless of actual attempt', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAttemptReference(
                    packageId,
                    'attempt-1',
                    undefined,
                ),
            ).not.toThrow();
            expect(() =>
                PackageGeocodingPolicy.validateAttemptReference(
                    packageId,
                    null,
                    undefined,
                ),
            ).not.toThrow();
        });

        it('allows operation when expected attempt is null and actual attempt is null', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAttemptReference(
                    packageId,
                    null,
                    null,
                ),
            ).not.toThrow();
        });

        it('throws PackageGeocodingReferenceMismatchError when expected attempt is null but actual attempt exists', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAttemptReference(
                    packageId,
                    'attempt-1',
                    null,
                ),
            ).toThrow(PackageGeocodingReferenceMismatchError);
        });

        it('throws PackageGeocodingReferenceMismatchError when attempt reference differs', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAttemptReference(
                    packageId,
                    'attempt-1',
                    'attempt-2',
                ),
            ).toThrow(PackageGeocodingReferenceMismatchError);
        });
    });

    describe('validateAttemptNotHistorical', () => {
        it('allows operation when attempt is not consumed by route stop', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAttemptNotHistorical(
                    'attempt-1',
                    false,
                ),
            ).not.toThrow();
        });

        it('throws PackageHistoricalAttemptLockedError when attempt is consumed', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAttemptNotHistorical(
                    'attempt-1',
                    true,
                ),
            ).toThrow(PackageHistoricalAttemptLockedError);
        });
    });

    describe('validateReviewInput', () => {
        it('accepts valid review input with APPROVED', () => {
            expect(() =>
                PackageGeocodingPolicy.validateReviewInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    expectedAttemptId: 'attempt-1',
                    candidateId: 'cand-1',
                    decision: 'APPROVED',
                    reason: 'Verified manually by operator',
                    reviewerUserId: 'user-1',
                }),
            ).not.toThrow();
        });

        it('accepts valid review input with REJECTED', () => {
            expect(() =>
                PackageGeocodingPolicy.validateReviewInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    expectedAttemptId: 'attempt-1',
                    candidateId: 'cand-1',
                    decision: 'REJECTED',
                    reason: 'Candidate outside city boundary',
                    reviewerUserId: 'user-1',
                }),
            ).not.toThrow();
        });

        it('rejects invalid decision value', () => {
            expect(() =>
                PackageGeocodingPolicy.validateReviewInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    expectedAttemptId: 'attempt-1',
                    candidateId: 'cand-1',
                    decision: 'UNKNOWN' as never,
                    reason: 'Reason',
                    reviewerUserId: 'user-1',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });

        it('rejects empty candidate ID', () => {
            expect(() =>
                PackageGeocodingPolicy.validateReviewInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    expectedAttemptId: 'attempt-1',
                    candidateId: '   ',
                    decision: 'APPROVED',
                    reason: 'Verified',
                    reviewerUserId: 'user-1',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });

        it('rejects empty review reason', () => {
            expect(() =>
                PackageGeocodingPolicy.validateReviewInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    expectedAttemptId: 'attempt-1',
                    candidateId: 'cand-1',
                    decision: 'APPROVED',
                    reason: '',
                    reviewerUserId: 'user-1',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });

        it('rejects empty reviewer user ID', () => {
            expect(() =>
                PackageGeocodingPolicy.validateReviewInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    expectedAttemptId: 'attempt-1',
                    candidateId: 'cand-1',
                    decision: 'APPROVED',
                    reason: 'Reason',
                    reviewerUserId: ' ',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });
    });

    describe('validateAddressCorrectionInput', () => {
        it('accepts valid address correction input', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAddressCorrectionInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    newOriginalText: 'Carrera 43 # 50 - 20',
                    newMunicipalityCode: '08001',
                    reason: 'Typo in street number',
                    actorUserId: 'user-1',
                }),
            ).not.toThrow();
        });

        it('rejects empty new address text', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAddressCorrectionInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    newOriginalText: '  ',
                    newMunicipalityCode: '08001',
                    reason: 'Reason',
                    actorUserId: 'user-1',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });

        it('rejects empty new municipality code', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAddressCorrectionInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    newOriginalText: 'Calle 10 # 20 - 30',
                    newMunicipalityCode: '',
                    reason: 'Reason',
                    actorUserId: 'user-1',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });

        it('rejects empty correction reason', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAddressCorrectionInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    newOriginalText: 'Calle 10 # 20 - 30',
                    newMunicipalityCode: '08001',
                    reason: ' ',
                    actorUserId: 'user-1',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });

        it('rejects empty actor user ID', () => {
            expect(() =>
                PackageGeocodingPolicy.validateAddressCorrectionInput({
                    tenantId: 'tenant-1',
                    packageId: 'pkg-1',
                    expectedAddressId: 'addr-1',
                    newOriginalText: 'Calle 10 # 20 - 30',
                    newMunicipalityCode: '08001',
                    reason: 'Reason',
                    actorUserId: '',
                }),
            ).toThrow(PackageGeocodingValidationError);
        });
    });
});
