import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

async function violations(body: Record<string, unknown>) {
  return validate(plainToInstance(LoginDto, body));
}

async function violatedProperties(body: Record<string, unknown>) {
  const errors = await violations(body);
  return errors.map((error) => error.property).sort();
}

// A syntactically valid address of exactly `length` characters: a 63-char
// local part and a domain of dotted labels of at most 60 chars ending in .com.
// A bare long local part would be rejected by IsEmail itself (local part max
// 64), so it could not prove the MaxLength decorator.
function emailOfLength(length: number): string {
  const local = 'a'.repeat(63);
  const labelsLength = length - local.length - 1 - '.com'.length;
  const labels: string[] = [];
  let remaining = labelsLength;
  while (remaining > 0) {
    const size = Math.min(60, remaining);
    labels.push('b'.repeat(size));
    remaining -= size + 1; // the dot that follows the label
  }
  return `${local}@${labels.join('.')}.com`;
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

  it('builds syntactically valid long emails (fixture sanity)', async () => {
    const email = emailOfLength(254);
    expect(email).toHaveLength(254);
    expect(await violatedProperties({ ...valid, email })).toEqual([]);
  });

  it('rejects an oversized slug and password', async () => {
    expect(
      await violatedProperties({ ...valid, slug: 'a'.repeat(256) }),
    ).toEqual(['slug']);
    expect(
      await violatedProperties({ ...valid, password: 'p'.repeat(1025) }),
    ).toEqual(['password']);
  });

  it('rejects an email longer than 255 characters through @MaxLength', async () => {
    const email = emailOfLength(300);
    expect(email).toHaveLength(300);

    const errors = await violations({ ...valid, email });

    expect(errors.map((error) => error.property)).toEqual(['email']);
    expect(Object.keys(errors[0].constraints ?? {})).toContain('maxLength');
  });

  it('does not report maxLength for an email of exactly 255 characters', async () => {
    const errors = await violations({ ...valid, email: emailOfLength(255) });

    // IsEmail still refuses anything over 254, but the length decorator
    // accepts the boundary value.
    expect(Object.keys(errors[0]?.constraints ?? {})).not.toContain(
      'maxLength',
    );
  });
});
