import { DeadLetterRecorder } from '../../application/messaging/dead-letter-recorder';
import type { DeadLetterStorePort } from '../../application/messaging/ports/dead-letter-store.port';

describe('DeadLetterRecorder', () => {
  let mockStore: jest.Mocked<DeadLetterStorePort>;
  let recorder: DeadLetterRecorder;

  beforeEach(() => {
    mockStore = {
      recordFailure: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };
    recorder = new DeadLetterRecorder(mockStore);
  });

  it('records failure with deterministic failureKey and attempts', async () => {
    await recorder.record({
      tenantId: '11111111-1111-4111-8111-111111111111',
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sourceQueue: 'sls.audit.integration-events.v1',
      consumerName: 'audit.integration-events.v1',
      attempts: 4,
      originalEvent: { foo: 'bar' },
      failureReason: 'EVENT_RETRIES_EXHAUSTED: Retries limit reached',
    });

    expect(mockStore.recordFailure).toHaveBeenCalledTimes(1);
    expect(mockStore.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: '11111111-1111-4111-8111-111111111111',
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        consumerName: 'audit.integration-events.v1',
        attempts: 4,
        failureKey:
          '11111111-1111-4111-8111-111111111111:audit.integration-events.v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:EVENT_RETRIES_EXHAUSTED',
      }),
    );
  });
});
