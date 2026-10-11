import type { DeadLetterStorePort } from './ports/dead-letter-store.port';
import type {
  RedriveStorePort,
  DeadLetterRedriveRecord,
} from './ports/redrive-store.port';
import type { ProcessedEventRegistry } from './ports/consumer-unit-of-work.port';
import {
  type OperatorContext,
  assertOperatorAuthorized,
} from './ports/messaging-operator.port';
import { MessagingError } from './messaging-errors';

export interface RequestRedriveInput {
  readonly tenantId: string;
  readonly deadLetterMessageId: string;
  readonly requestId: string;
  readonly reason: string;
  readonly operatorContext: OperatorContext;
}

export type RequestRedriveResult =
  | { readonly status: 'PENDING'; readonly redrive: DeadLetterRedriveRecord }
  | { readonly status: 'ALREADY_PROCESSED'; readonly message: string };

export class RequestDeadLetterRedriveUseCase {
  constructor(
    private readonly deadLetterStore: DeadLetterStorePort,
    private readonly redriveStore: RedriveStorePort,
    private readonly processedEventRegistry: ProcessedEventRegistry,
  ) {}

  async execute(input: RequestRedriveInput): Promise<RequestRedriveResult> {
    assertOperatorAuthorized(input.operatorContext, input.tenantId);

    const deadLetter = await this.deadLetterStore.findById(
      input.tenantId,
      input.deadLetterMessageId,
    );

    if (!deadLetter) {
      throw new MessagingError(
        'DEAD_LETTER_NOT_FOUND',
        `Dead letter message '${input.deadLetterMessageId}' not found for tenant '${input.tenantId}'`,
        'deadLetterMessageId',
      );
    }

    const alreadyProcessed = await this.processedEventRegistry.isProcessed({
      tenantId: input.tenantId,
      eventId: deadLetter.eventId,
      consumerName: deadLetter.consumerName,
    });

    if (alreadyProcessed) {
      return {
        status: 'ALREADY_PROCESSED',
        message: `Event '${deadLetter.eventId}' has already been processed by consumer '${deadLetter.consumerName}'`,
      };
    }

    const redrive = await this.redriveStore.createRequest({
      id: input.requestId,
      tenantId: input.tenantId,
      deadLetterMessageId: input.deadLetterMessageId,
      consumerName: deadLetter.consumerName,
      requestedBy: input.operatorContext.operatorId,
      reason: input.reason,
    });

    return {
      status: 'PENDING',
      redrive,
    };
  }
}
