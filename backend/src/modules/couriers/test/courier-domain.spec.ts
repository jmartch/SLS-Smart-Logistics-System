import { isUserEligibleForCourier } from '../domain/courier-user-eligibility.policy';
import { normalizeCourierUserId } from '../domain/courier-user-id';
import { InvalidCourierError } from '../domain/invalid-courier.error';

function reasonOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof InvalidCourierError) {
      return `${error.field}:${error.reason}`;
    }
    throw error;
  }
  return undefined;
}

const UUID = '30000000-0000-4000-8000-0000000000AB';

describe('normalizeCourierUserId', () => {
  it('trims and lowercases a valid UUID', () => {
    expect(normalizeCourierUserId(`  ${UUID} `)).toBe(UUID.toLowerCase());
  });

  it.each([undefined, null, '', '   '])('requires a value (%j)', (value) => {
    expect(reasonOf(() => normalizeCourierUserId(value))).toBe(
      'userId:REQUIRED',
    );
  });

  it.each(['abc', '123', `${UUID}x`, 12345, {}, ['x']])(
    'rejects an invalid format (%j)',
    (value) => {
      expect(reasonOf(() => normalizeCourierUserId(value))).toBe(
        'userId:INVALID_FORMAT',
      );
    },
  );
});

describe('isUserEligibleForCourier', () => {
  it('accepts only ACTIVE users', () => {
    expect(isUserEligibleForCourier('ACTIVE')).toBe(true);
    expect(isUserEligibleForCourier('INACTIVE')).toBe(false);
    expect(isUserEligibleForCourier('SUSPENDED')).toBe(false);
    expect(isUserEligibleForCourier('active')).toBe(false);
    expect(isUserEligibleForCourier('')).toBe(false);
  });
});
