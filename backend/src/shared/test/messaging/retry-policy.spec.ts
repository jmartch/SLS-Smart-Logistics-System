import { RetryPolicy } from '../../application/messaging/retry-policy';
import {
  MESSAGING_ERROR_CODES,
  MessagingError,
} from '../../application/messaging/messaging-errors';

describe('RetryPolicy', () => {
  const policy = new RetryPolicy();
  const consumerName = 'audit.integration-events.v1';

  it('evaluates transient error as RETRY step 1 (5000ms) on initial failure', () => {
    const outcome = policy.evaluate(
      new Error('Temporary DB lock timeout'),
      0,
      consumerName,
      true,
    );

    expect(outcome).toEqual({
      action: 'RETRY',
      step: 1,
      delayMs: 5000,
      routingKey: `${consumerName}.retry.1`,
    });
  });

  it('evaluates transient error as RETRY step 2 (10000ms) on second failure', () => {
    const outcome = policy.evaluate(
      new Error('Temporary network glitch'),
      1,
      consumerName,
      true,
    );

    expect(outcome).toEqual({
      action: 'RETRY',
      step: 2,
      delayMs: 10000,
      routingKey: `${consumerName}.retry.2`,
    });
  });

  it('evaluates transient error as RETRY step 3 (20000ms) on third failure', () => {
    const outcome = policy.evaluate(
      new Error('Service unavailable'),
      2,
      consumerName,
      true,
    );

    expect(outcome).toEqual({
      action: 'RETRY',
      step: 3,
      delayMs: 20000,
      routingKey: `${consumerName}.retry.3`,
    });
  });

  it('evaluates error as DLQ when max retries (3) are exhausted', () => {
    const outcome = policy.evaluate(
      new Error('Persistent downstream failure'),
      3,
      consumerName,
      true,
    );

    expect(outcome.action).toBe('DLQ');
    if (outcome.action === 'DLQ') {
      expect(outcome.reason).toContain('EVENT_RETRIES_EXHAUSTED');
    }
  });

  it('evaluates permanent validation errors as DLQ immediately without retrying', () => {
    const jsonError = new MessagingError(
      MESSAGING_ERROR_CODES.EVENT_INVALID_JSON,
      'Malformed payload',
    );
    const envelopeError = new MessagingError(
      MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
      'Missing fields',
    );
    const versionError = new MessagingError(
      MESSAGING_ERROR_CODES.EVENT_UNSUPPORTED_VERSION,
      'Version 99 not supported',
    );

    expect(policy.evaluate(jsonError, 0, consumerName, true)).toEqual({
      action: 'DLQ',
      reason: expect.stringContaining(MESSAGING_ERROR_CODES.EVENT_INVALID_JSON),
    });
    expect(policy.evaluate(envelopeError, 0, consumerName, true)).toEqual({
      action: 'DLQ',
      reason: expect.stringContaining(
        MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
      ),
    });
    expect(policy.evaluate(versionError, 0, consumerName, true)).toEqual({
      action: 'DLQ',
      reason: expect.stringContaining(
        MESSAGING_ERROR_CODES.EVENT_UNSUPPORTED_VERSION,
      ),
    });
  });

  it('evaluates identity mismatch or untrusted tenant as QUARANTINE', () => {
    const mismatchError = new MessagingError(
      MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
      'Tenant header mismatch',
    );

    expect(policy.evaluate(mismatchError, 0, consumerName, true)).toEqual({
      action: 'QUARANTINE',
      reason: 'Tenant header mismatch',
    });

    expect(
      policy.evaluate(new Error('Unknown message'), 0, consumerName, false),
    ).toEqual({
      action: 'QUARANTINE',
      reason: expect.any(String),
    });
  });
});
