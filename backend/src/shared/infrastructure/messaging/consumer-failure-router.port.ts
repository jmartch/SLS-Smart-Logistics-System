import type { Channel, ConsumeMessage } from 'amqplib';

export interface ConsumerFailureRouterPort {
  routeFailure(
    msg: ConsumeMessage,
    channel: Channel,
    error: Error,
  ): Promise<void>;
}
