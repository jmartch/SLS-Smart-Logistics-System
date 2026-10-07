import type { ProcessingIdentity } from '../event-envelope';

export interface ProcessedEventRegistry {
  tryRegister(identity: ProcessingIdentity): Promise<boolean>;
  isProcessed(identity: ProcessingIdentity): Promise<boolean>;
}

export interface ConsumerSession {
  readonly processedEvents: ProcessedEventRegistry;
}

export interface ConsumerUnitOfWork<
  S extends ConsumerSession = ConsumerSession,
> {
  run<T>(tenantId: string, work: (session: S) => Promise<T>): Promise<T>;
}
