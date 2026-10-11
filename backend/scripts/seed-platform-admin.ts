import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { Client } from 'pg';

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!email || !password || !databaseUrl) {
    throw new Error(
      'PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, and DATABASE_URL are required',
    );
  }

  const passwordHash = await argon2.hash(password);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO "PlatformAdmin" (id, email, "passwordHash")
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [randomUUID(), email, passwordHash],
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
