import {
  DeliveryAttempt,
  type DeliveryAttemptProps,
} from '../domain/delivery-attempt';
import {
  DeliveryEvidence,
  type DeliveryEvidenceProps,
} from '../domain/delivery-evidence';
import {
  DeliveryEvidenceValidationError,
  DeliveryValidationError,
} from '../domain/delivery-errors';
import { DeliveryFailureReason } from '../domain/delivery-failure-reason';
import {
  DeliveryStopResolutionPolicy,
  type StopResolutionInput,
} from '../domain/delivery-stop-resolution.policy';

// --- Fixtures & Helpers ---

const VALID_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function createEvidenceFixture(
  overrides: Partial<DeliveryEvidenceProps> = {},
): DeliveryEvidence {
  return new DeliveryEvidence({
    id: 'evidence-1',
    tenantId: 'tenant-1',
    deliveryAttemptId: 'attempt-1',
    evidenceType: 'PHOTO',
    storageKey: 'tenant-1/evidence-1.jpg',
    checksum: VALID_SHA256,
    createdAt: new Date('2026-10-06T12:00:00.000Z'),
    ...overrides,
  });
}

function createSuccessfulAttemptProps(
  overrides: Partial<Omit<DeliveryAttemptProps, 'outcome' | 'reasonCode'>> = {},
) {
  return {
    id: 'attempt-1',
    tenantId: 'tenant-1',
    routeStopId: 'stop-1',
    packageId: 'package-1',
    courierId: 'courier-1',
    assignmentId: 'assignment-1',
    attemptNumber: 1,
    evidences: [createEvidenceFixture()],
    attemptedAt: new Date('2026-10-06T12:00:00.000Z'),
    ...overrides,
  };
}

function createFailedAttemptProps(
  overrides: Partial<Omit<DeliveryAttemptProps, 'outcome' | 'reasonCode'>> & {
    reasonCode?: DeliveryFailureReason;
  } = {},
): Omit<DeliveryAttemptProps, 'outcome' | 'reasonCode'> & {
  reasonCode: DeliveryFailureReason;
} {
  return {
    id: 'attempt-1',
    tenantId: 'tenant-1',
    routeStopId: 'stop-1',
    packageId: 'package-1',
    courierId: 'courier-1',
    assignmentId: 'assignment-1',
    attemptNumber: 1,
    reasonCode: DeliveryFailureReason.RECIPIENT_ABSENT,
    evidences: [],
    attemptedAt: new Date('2026-10-06T12:00:00.000Z'),
    ...overrides,
  };
}

describe('Delivery Domain', () => {
  describe('DeliveryEvidence', () => {
    it('creates an immutable evidence record with a valid SHA-256 checksum', () => {
      // Arrange & Act
      const evidence = createEvidenceFixture({
        evidenceType: 'SIGNATURE',
        storageKey: 'tenant-1/signature-1.png',
      });

      // Assert
      expect(evidence.id).toBe('evidence-1');
      expect(evidence.tenantId).toBe('tenant-1');
      expect(evidence.evidenceType).toBe('SIGNATURE');
      expect(evidence.checksum).toBe(VALID_SHA256);
      expect(evidence.storageKey).toBe('tenant-1/signature-1.png');
    });

    it.each([
      ['', 'empty string'],
      ['   ', 'whitespace only'],
    ])('rejects an invalid storageKey: %s', (invalidKey) => {
      // Arrange
      const instantiate = () =>
        createEvidenceFixture({ storageKey: invalidKey });

      // Act & Assert
      expect(instantiate).toThrow(DeliveryEvidenceValidationError);
      try {
        instantiate();
      } catch (error) {
        expect(error).toMatchObject({
          code: 'INVALID_EVIDENCE',
          field: 'storageKey',
        });
      }
    });

    it.each([
      ['invalid-hash', 'not a hex string'],
      [
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85',
        '63 chars (too short)',
      ],
      [
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855aa',
        '66 chars (too long)',
      ],
      [
        'zzb0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'non-hex characters',
      ],
    ])('rejects an invalid SHA-256 checksum: %s (%s)', (invalidChecksum) => {
      // Arrange
      const instantiate = () =>
        createEvidenceFixture({ checksum: invalidChecksum });

      // Act & Assert
      expect(instantiate).toThrow(DeliveryEvidenceValidationError);
      try {
        instantiate();
      } catch (error) {
        expect(error).toMatchObject({
          code: 'INVALID_EVIDENCE',
          field: 'checksum',
        });
      }
    });

    it.each([
      ['id', { id: '' }],
      ['tenantId', { tenantId: '' }],
      ['deliveryAttemptId', { deliveryAttemptId: '' }],
    ])('rejects missing required identifier: %s', (_field, override) => {
      // Arrange & Act & Assert
      expect(() => createEvidenceFixture(override)).toThrow(
        DeliveryEvidenceValidationError,
      );
    });
  });

  describe('DeliveryAttempt', () => {
    describe('createSuccessful', () => {
      it('creates a valid successful attempt with evidence', () => {
        // Arrange
        const props = createSuccessfulAttemptProps();

        // Act
        const attempt = DeliveryAttempt.createSuccessful(props);

        // Assert
        expect(attempt.outcome).toBe('DELIVERED');
        expect(attempt.reasonCode).toBeNull();
        expect(attempt.attemptNumber).toBe(1);
        expect(attempt.evidences).toHaveLength(1);
      });

      it('rejects a successful attempt when no evidence is provided', () => {
        // Arrange
        const props = createSuccessfulAttemptProps({ evidences: [] });

        // Act
        const create = () => DeliveryAttempt.createSuccessful(props);

        // Assert
        expect(create).toThrow(DeliveryEvidenceValidationError);
        try {
          create();
        } catch (error) {
          expect(error).toMatchObject({
            code: 'INVALID_EVIDENCE',
            field: 'evidences',
          });
        }
      });
    });

    describe('createFailed', () => {
      it('creates a valid failed attempt with reasonCode', () => {
        // Arrange
        const props = createFailedAttemptProps({
          reasonCode: DeliveryFailureReason.ADDRESS_NOT_FOUND,
          notes: 'Customer house number not found on the street',
        });

        // Act
        const attempt = DeliveryAttempt.createFailed(props);

        // Assert
        expect(attempt.outcome).toBe('FAILED');
        expect(attempt.reasonCode).toBe(
          DeliveryFailureReason.ADDRESS_NOT_FOUND,
        );
        expect(attempt.notes).toBe(
          'Customer house number not found on the street',
        );
      });

      it('rejects a failed attempt without a valid reasonCode', () => {
        // Arrange
        const props = createFailedAttemptProps({
          reasonCode: 'INVALID_REASON' as unknown as DeliveryFailureReason,
        });

        // Act
        const create = () => DeliveryAttempt.createFailed(props);

        // Assert
        expect(create).toThrow(DeliveryValidationError);
        try {
          create();
        } catch (error) {
          expect(error).toMatchObject({
            code: 'DELIVERY_VALIDATION_ERROR',
            field: 'reasonCode',
          });
        }
      });

      it('rejects reasonCode "OTHER" when notes are missing or empty', () => {
        // Arrange
        const props = createFailedAttemptProps({
          reasonCode: DeliveryFailureReason.OTHER,
          notes: '   ',
        });

        // Act
        const create = () => DeliveryAttempt.createFailed(props);

        // Assert
        expect(create).toThrow(DeliveryValidationError);
        try {
          create();
        } catch (error) {
          expect(error).toMatchObject({
            code: 'DELIVERY_VALIDATION_ERROR',
            field: 'notes',
          });
        }
      });

      it('accepts reasonCode "OTHER" when notes are descriptive', () => {
        // Arrange
        const props = createFailedAttemptProps({
          reasonCode: DeliveryFailureReason.OTHER,
          notes: 'Extreme weather blocked road access entirely',
        });

        // Act
        const attempt = DeliveryAttempt.createFailed(props);

        // Assert
        expect(attempt.outcome).toBe('FAILED');
        expect(attempt.reasonCode).toBe(DeliveryFailureReason.OTHER);
      });
    });

    describe('invariants', () => {
      it('rejects attemptNumber less than 1', () => {
        // Arrange
        const props = createSuccessfulAttemptProps({ attemptNumber: 0 });

        // Act & Assert
        expect(() => DeliveryAttempt.createSuccessful(props)).toThrow(
          DeliveryValidationError,
        );
      });

      it('rejects notes exceeding 1000 characters after trim', () => {
        // Arrange
        const longNotes = 'a'.repeat(1001);
        const props = createFailedAttemptProps({
          reasonCode: DeliveryFailureReason.RECIPIENT_ABSENT,
          notes: longNotes,
        });

        // Act
        const create = () => DeliveryAttempt.createFailed(props);

        // Assert
        expect(create).toThrow(DeliveryValidationError);
        try {
          create();
        } catch (error) {
          expect(error).toMatchObject({
            code: 'DELIVERY_VALIDATION_ERROR',
            field: 'notes',
          });
        }
      });
    });
  });

  describe('DeliveryStopResolutionPolicy', () => {
    it('returns PENDING when the stop manifest is empty', () => {
      // Arrange
      const input: StopResolutionInput = {
        manifestPackageIds: [],
        terminalOutcomes: new Map(),
      };

      // Act
      const result = DeliveryStopResolutionPolicy.resolve(input);

      // Assert
      expect(result).toBe('PENDING');
    });

    it('returns PENDING when a single-package stop is not yet resolved', () => {
      // Arrange
      const input: StopResolutionInput = {
        manifestPackageIds: ['pkg-1'],
        terminalOutcomes: new Map(),
      };

      // Act
      const result = DeliveryStopResolutionPolicy.resolve(input);

      // Assert
      expect(result).toBe('PENDING');
    });

    it('returns COMPLETED when a single-package stop is delivered', () => {
      // Arrange
      const input: StopResolutionInput = {
        manifestPackageIds: ['pkg-1'],
        terminalOutcomes: new Map([['pkg-1', 'DELIVERED']]),
      };

      // Act
      const result = DeliveryStopResolutionPolicy.resolve(input);

      // Assert
      expect(result).toBe('COMPLETED');
    });

    it('returns FAILED when a single-package stop has failed', () => {
      // Arrange
      const input: StopResolutionInput = {
        manifestPackageIds: ['pkg-1'],
        terminalOutcomes: new Map([['pkg-1', 'FAILED']]),
      };

      // Act
      const result = DeliveryStopResolutionPolicy.resolve(input);

      // Assert
      expect(result).toBe('FAILED');
    });

    describe('multi-package stop scenarios', () => {
      it('returns PENDING when the first package is delivered but the second package is still pending', () => {
        // Arrange
        const input: StopResolutionInput = {
          manifestPackageIds: ['pkg-1', 'pkg-2'],
          terminalOutcomes: new Map([['pkg-1', 'DELIVERED']]),
        };

        // Act
        const result = DeliveryStopResolutionPolicy.resolve(input);

        // Assert
        expect(result).toBe('PENDING');
      });

      it('returns PENDING when the first package failed but the second package is still pending', () => {
        // Arrange
        const input: StopResolutionInput = {
          manifestPackageIds: ['pkg-1', 'pkg-2'],
          terminalOutcomes: new Map([['pkg-1', 'FAILED']]),
        };

        // Act
        const result = DeliveryStopResolutionPolicy.resolve(input);

        // Assert
        expect(result).toBe('PENDING');
      });

      it('returns COMPLETED only when ALL manifest packages are delivered', () => {
        // Arrange
        const input: StopResolutionInput = {
          manifestPackageIds: ['pkg-1', 'pkg-2', 'pkg-3'],
          terminalOutcomes: new Map([
            ['pkg-1', 'DELIVERED'],
            ['pkg-2', 'DELIVERED'],
            ['pkg-3', 'DELIVERED'],
          ]),
        };

        // Act
        const result = DeliveryStopResolutionPolicy.resolve(input);

        // Assert
        expect(result).toBe('COMPLETED');
      });

      it('returns FAILED when all packages are resolved and at least one outcome is FAILED', () => {
        // Arrange: pkg-1 and pkg-3 succeeded, but pkg-2 failed
        const input: StopResolutionInput = {
          manifestPackageIds: ['pkg-1', 'pkg-2', 'pkg-3'],
          terminalOutcomes: new Map([
            ['pkg-1', 'DELIVERED'],
            ['pkg-2', 'FAILED'],
            ['pkg-3', 'DELIVERED'],
          ]),
        };

        // Act
        const result = DeliveryStopResolutionPolicy.resolve(input);

        // Assert
        expect(result).toBe('FAILED');
      });

      it('ignores terminal outcomes of foreign packages not belonging to the stop manifest', () => {
        // Arrange: foreign package is FAILED, but manifest pkg-1 is DELIVERED
        const input: StopResolutionInput = {
          manifestPackageIds: ['pkg-1'],
          terminalOutcomes: new Map([
            ['pkg-1', 'DELIVERED'],
            ['foreign-pkg-99', 'FAILED'],
          ]),
        };

        // Act
        const result = DeliveryStopResolutionPolicy.resolve(input);

        // Assert
        expect(result).toBe('COMPLETED');
      });
    });
  });
});
