import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { HttpErrorFilter } from './http-error.filter';
import { NotATenantActorError } from '../../../shared/application/tenant-context';

function fakeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('HttpErrorFilter', () => {
  const filter = new HttpErrorFilter();
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerError.mockRestore();
  });

  it('passes through an HttpException body that already carries the error envelope', () => {
    const envelope = {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Correo, empresa o contrasena incorrectos.',
        fields: null,
      },
    };
    const { host, status, json } = fakeHost();

    filter.catch(new UnauthorizedException(envelope), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(envelope);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it.each([
    [new BadRequestException('x'), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedException('x'), 401, 'SESSION_EXPIRED'],
    [new ForbiddenException('x'), 403, 'PERMISSION_DENIED'],
    [new NotFoundException('x'), 404, 'RESOURCE_NOT_FOUND'],
    [new ConflictException('x'), 409, 'CONFLICT'],
    [new HttpException('x', 429), 429, 'UNEXPECTED_ERROR'],
  ])(
    'maps a plain HttpException (%#) to its status and a stable code',
    (exception, expectedStatus, expectedCode) => {
      const { host, status, json } = fakeHost();

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        error: { code: expectedCode, message: 'x', fields: null },
      });
    },
  );

  it.each([
    [new InternalServerErrorException('db-host-internal:5432 refused'), 500],
    [
      new ServiceUnavailableException('pool exhausted at db-host-internal'),
      503,
    ],
    [new HttpException('upstream failure db-host-internal', 502), 502],
  ])(
    'answers a >= 500 HttpException without envelope (%#) with the generic message and logs it',
    (exception, expectedStatus) => {
      const { host, status, json } = fakeHost();

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'Ocurrio un error inesperado.',
          fields: null,
        },
      });
      expect(JSON.stringify(json.mock.calls)).not.toContain('db-host-internal');
      expect(loggerError).toHaveBeenCalledWith(
        exception.message,
        exception.stack,
      );
    },
  );

  it('keeps a >= 500 HttpException that carries our envelope untouched and unlogged', () => {
    const envelope = {
      error: {
        code: 'SERVICE_BUSY',
        message: 'Intenta de nuevo en unos segundos.',
        fields: null,
      },
    };
    const { host, status, json } = fakeHost();

    filter.catch(new ServiceUnavailableException(envelope), host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(envelope);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('maps an exposed 413 from the HTTP stack to PAYLOAD_TOO_LARGE', () => {
    const { host, status, json } = fakeHost();
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });

    filter.catch(tooLarge, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: expect.any(String) as string,
        fields: null,
      },
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('keeps UNEXPECTED_ERROR for other exposed 4xx client errors without a dedicated code', () => {
    const { host, status, json } = fakeHost();
    const teapot = Object.assign(new Error('nope'), {
      status: 418,
      expose: true,
    });

    filter.catch(teapot, host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'UNEXPECTED_ERROR',
        message: expect.any(String) as string,
        fields: null,
      },
    });
  });

  it('maps NotATenantActorError to 403 PERMISSION_DENIED', () => {
    const { host, status, json } = fakeHost();

    filter.catch(new NotATenantActorError(), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PERMISSION_DENIED',
        message: expect.any(String) as string,
        fields: null,
      },
    });
  });

  it('maps a client error from the HTTP stack (malformed JSON body) to 400', () => {
    const { host, status, json } = fakeHost();
    const bodyParserError = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      statusCode: 400,
      expose: true,
      type: 'entity.parse.failed',
    });

    filter.catch(bodyParserError, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String) as string,
        fields: null,
      },
    });
  });

  it('answers an unknown error with a generic 500 and logs it server-side', () => {
    const { host, status, json } = fakeHost();
    const failure = new Error('connection to db-host-internal:5432 refused');

    filter.catch(failure, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledTimes(1);
    const body = (json.mock.calls as unknown[][])[0][0] as {
      error: { code: string; message: string; fields: null };
    };
    expect(body.error.code).toBe('UNEXPECTED_ERROR');
    expect(body.error.fields).toBeNull();
    expect(JSON.stringify(body)).not.toContain('db-host-internal');
    expect(JSON.stringify(body)).not.toContain('refused');
    expect(loggerError).toHaveBeenCalledWith(failure.message, failure.stack);
  });

  it('logs non-Error throwables without leaking them to the client', () => {
    const { host, status, json } = fakeHost();

    filter.catch('secret string', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(
      JSON.stringify((json.mock.calls as unknown[][])[0][0]),
    ).not.toContain('secret');
    expect(loggerError).toHaveBeenCalledTimes(1);
  });
});
