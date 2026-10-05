import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

async function violatedProperties(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(LoginDto, body));
  return errors.map((error) => error.property).sort();
}

describe('LoginDto', () => {
  const valid = { slug: 'acme', email: 'user@acme.test', password: 'secret' };

  it('accepts a normal body', async () => {
    expect(await violatedProperties(valid)).toEqual([]);
  });

  it('accepts a slug and password exactly at the length limits', async () => {
    expect(
      await violatedProperties({
        ...valid,
        slug: 'a'.repeat(255),
        password: 'p'.repeat(1024),
      }),
    ).toEqual([]);
  });

  it('rejects an oversized slug, email, and password', async () => {
    expect(
      await violatedProperties({ ...valid, slug: 'a'.repeat(256) }),
    ).toEqual(['slug']);
    expect(
      await violatedProperties({
        ...valid,
        email: `${'a'.repeat(250)}@acme.test`,
      }),
    ).toEqual(['email']);
    expect(
      await violatedProperties({ ...valid, password: 'p'.repeat(1025) }),
    ).toEqual(['password']);
  });
});
