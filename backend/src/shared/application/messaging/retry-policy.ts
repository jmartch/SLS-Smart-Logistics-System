import { MESSAGING_ERROR_CODES, MessagingError } from './messaging-errors';

export type FailureAction =
  | {
      readonly action: 'RETRY';
      readonly step: number;
      readonly delayMs: number;
      readonly routingKey: string;
    }
  | { readonly action: 'DLQ'; readonly reason: string }
  | { readonly action: 'QUARANTINE'; readonly reason: string };

export class RetryPolicy {
  static readonly MAX_RETRIES = 3;
  static readonly RETRY_STEPS = [
    { step: 1, delayMs: 5000 },
    { step: 2, delayMs: 10000 },
    { step: 3, delayMs: 20000 },
  ] as const;

  evaluate(
    error: Error,
    currentRetryCount: number,
    consumerName: string,
    hasTrustedTenant: boolean,
  ): FailureAction {
    // 1. Mensajes sin tenant confiable van a cuarentena
    if (!hasTrustedTenant) {
      return {
        action: 'QUARANTINE',
        reason: error.message || 'Untrusted or missing tenant identity',
      };
    }

    if (error instanceof MessagingError) {
      if (error.code === MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH) {
        return {
          action: 'QUARANTINE',
          reason: error.message,
        };
      }

      // Errores permanentes con tenant confiable van directamente a DLQ sin retries
      if (
        error.code === MESSAGING_ERROR_CODES.EVENT_INVALID_JSON ||
        error.code === MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE ||
        error.code === MESSAGING_ERROR_CODES.EVENT_UNSUPPORTED_VERSION ||
        error.code === MESSAGING_ERROR_CODES.BROKER_DELIVERY_LIMIT_EXCEEDED
      ) {
        return {
          action: 'DLQ',
          reason: `${error.code}: ${error.message}`,
        };
      }
    }

    // 2. Si se alcanzaron los 3 reintentos máximos, enviar a DLQ
    if (currentRetryCount >= RetryPolicy.MAX_RETRIES) {
      return {
        action: 'DLQ',
        reason: `${MESSAGING_ERROR_CODES.EVENT_RETRIES_EXHAUSTED}: Maximum retries (${RetryPolicy.MAX_RETRIES}) exhausted. Last error: ${error.message}`,
      };
    }

    // 3. Próximo paso de reintento
    const nextStep = currentRetryCount + 1;
    const config =
      RetryPolicy.RETRY_STEPS[nextStep - 1] ?? RetryPolicy.RETRY_STEPS[2];

    return {
      action: 'RETRY',
      step: nextStep,
      delayMs: config.delayMs,
      routingKey: `${consumerName}.retry.${nextStep}`,
    };
  }
}
