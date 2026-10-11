import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { validationExceptionFactory } from './validation-exception.factory';

describe('validationExceptionFactory', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });

  async function validate(value: unknown): Promise<BadRequestException> {
    try {
      await pipe.transform(value, { type: 'body', metatype: LoginDto });
    } catch (error) {
      return error as BadRequestException;
    }
    throw new Error('expected validation to fail');
  }

  it('produces a 400 VALIDATION_ERROR envelope with a [{ field, reason }] list', async () => {
    const exception = await validate({ slug: 'acme', email: 'not-an-email' });

    expect(exception.getStatus()).toBe(400);
    const body = exception.getResponse() as {
      error: {
        code: string;
        message: string;
        fields: { field: string; reason: string }[];
      };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof body.error.message).toBe('string');
    expect(Array.isArray(body.error.fields)).toBe(true);
    expect(body.error.fields).toHaveLength(4);
    expect(body.error.fields).toEqual(
      expect.arrayContaining([
        { field: 'email', reason: 'email must be an email' },
        { field: 'password', reason: 'password must be a string' },
        {
          field: 'password',
          reason: 'password must be longer than or equal to 1 characters',
        },
        {
          field: 'password',
          reason: 'password must be shorter than or equal to 1024 characters',
        },
      ]),
    );
  });

  it('reports only the constraints actually violated', async () => {
    const exception = await validate({
      slug: 'acme',
      email: 'a@b.co',
      password: '',
    });
    const body = exception.getResponse() as {
      error: { fields: { field: string; reason: string }[] };
    };

    expect(body.error.fields).toEqual([
      {
        field: 'password',
        reason: 'password must be longer than or equal to 1 characters',
      },
    ]);
  });

  it('accepts a valid body', async () => {
    await expect(
      pipe.transform(
        { slug: 'acme', email: 'a@b.co', password: 'x' },
        { type: 'body', metatype: LoginDto },
      ),
    ).resolves.toBeInstanceOf(LoginDto);
  });
});
