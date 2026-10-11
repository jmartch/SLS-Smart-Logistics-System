import type { EventEnvelope, ProcessingIdentity } from './event-envelope';
import type {
  ConsumerSession,
  ConsumerUnitOfWork,
} from './ports/consumer-unit-of-work.port';

export interface IdempotentConsumerOutcome {
  readonly status: 'APPLIED' | 'DUPLICATE';
  readonly identity: ProcessingIdentity;
}

export type ConsumerHandler<S extends ConsumerSession> = (
  session: S,
  envelope: EventEnvelope,
) => Promise<void>;

export class IdempotentConsumer<S extends ConsumerSession = ConsumerSession> {
  constructor(
    readonly consumerName: string,
    private readonly unitOfWork: ConsumerUnitOfWork<S>,
  ) {}

  async process(
    envelope: EventEnvelope,
    handler: ConsumerHandler<S>,
  ): Promise<IdempotentConsumerOutcome> {
    const identity: ProcessingIdentity = {
      tenantId: envelope.tenantId,
      eventId: envelope.eventId,
      consumerName: this.consumerName,
    };

    return await this.unitOfWork.run(envelope.tenantId, async (session) => {
      const isNew = await session.processedEvents.tryRegister(identity);
      if (!isNew) {
        return {
          status: 'DUPLICATE' as const,
          identity,
        };
      }

      await handler(session, envelope);

      return {
        status: 'APPLIED' as const,
        identity,
      };
    });
  }
}
