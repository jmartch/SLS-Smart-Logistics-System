import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { NotATenantActorError } from '../../../shared/application/tenant-context';

interface ErrorEnvelope {
  error: { code: string; message: string; fields: unknown };
}

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'SESSION_EXPIRED',
  [HttpStatus.FORBIDDEN]: 'PERMISSION_DENIED',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
};

const FIRST_SERVER_ERROR_STATUS = 500;
const UNEXPECTED_MESSAGE = 'Ocurrio un error inesperado.';

function envelope(code: string, message: string): ErrorEnvelope {
  return { error: { code, message, fields: null } };
}

function hasErrorEnvelope(body: unknown): body is ErrorEnvelope {
  // Nest's own HttpException bodies carry `error` as a string ("Conflict"),
  // so only an object-valued `error` counts as our envelope.
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }
  const { error } = body;

  return typeof error === 'object' && error !== null;
}

// Client errors raised by the HTTP stack before Nest sees the request (for
// example body-parser rejecting malformed JSON) are not HttpExceptions but
// carry an exposed 4xx status.
function clientErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }
  const { status, expose } = exception as {
    status?: unknown;
    expose?: unknown;
  };

  return expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
    ? status
    : null;
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (hasErrorEnvelope(body)) {
        response.status(status).json(body);
        return;
      }

      if (status >= FIRST_SERVER_ERROR_STATUS) {
        // A server-side failure carries internal detail in its message: log it
        // and answer like any other unexpected error.
        this.logUnexpected(exception);
        response
          .status(status)
          .json(envelope('UNEXPECTED_ERROR', UNEXPECTED_MESSAGE));
        return;
      }

      response
        .status(status)
        .json(
          envelope(
            CODE_BY_STATUS[status] ?? 'UNEXPECTED_ERROR',
            exception.message,
          ),
        );
      return;
    }

    if (exception instanceof NotATenantActorError) {
      response
        .status(HttpStatus.FORBIDDEN)
        .json(envelope('PERMISSION_DENIED', exception.message));
      return;
    }

    const clientStatus = clientErrorStatus(exception);
    if (clientStatus !== null) {
      response
        .status(clientStatus)
        .json(
          envelope(
            CODE_BY_STATUS[clientStatus] ?? 'UNEXPECTED_ERROR',
            'La solicitud no es valida.',
          ),
        );
      return;
    }

    this.logUnexpected(exception);

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(envelope('UNEXPECTED_ERROR', UNEXPECTED_MESSAGE));
  }

  // Only the error itself is logged: never request bodies, cookies or tokens.
  // The client gets no internal detail.
  private logUnexpected(exception: unknown): void {
    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(`Non-Error exception thrown: ${String(exception)}`);
    }
  }
}
