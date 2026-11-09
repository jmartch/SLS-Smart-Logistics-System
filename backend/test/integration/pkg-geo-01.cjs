const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

if (!process.env.GDB_TEST_ADMIN_URL) {
    throw new Error('GDB_TEST_ADMIN_URL is required');
}

const adminUrl = new URL(process.env.GDB_TEST_ADMIN_URL);

const SAFE_TEST_HOSTS = new Set([
    'integration-postgres',
    'sls-pkg-geo-01-integration-postgres',
]);

const allowLocal =
    process.env.ALLOW_LOCAL_DISPOSABLE_POSTGRES === '1' ||
    process.env.ALLOW_LOCAL_DISPOSABLE_POSTGRES === 'true';

if (adminUrl.hostname === 'localhost' || adminUrl.hostname === '127.0.0.1') {
    if (!allowLocal) {
        throw new Error(
            `Refusing to connect to '${adminUrl.hostname}' without explicit ALLOW_LOCAL_DISPOSABLE_POSTGRES=1 opt-in.`,
        );
    }
} else if (!SAFE_TEST_HOSTS.has(adminUrl.hostname)) {
    throw new Error(
        `GDB_TEST_ADMIN_URL host '${adminUrl.hostname}' is not an authorized disposable test host. Refusing to run migrations on shared database.`,
    );
}

if (adminUrl.pathname !== '/postgres' && adminUrl.pathname !== '/') {
    throw new Error(
        `GDB_TEST_ADMIN_URL must point to admin database '/postgres' (got '${adminUrl.pathname}'). Refusing execution.`,
    );
}
const control = new Pool({
    connectionString: adminUrl.toString(),
});

const databaseName =
    'sls_pkggeo01_' + randomUUID().replaceAll('-', '').toLowerCase();

function run(command, args, environment) {
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        env: {
            ...process.env,
            ...environment,
        },
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            `${command} ${args.join(' ')} failed with status ${result.status}`,
        );
    }
}

async function main() {
    let databaseCreated = false;

    try {
        console.log(`Creating disposable database ${databaseName}`);

        await control.query(`CREATE DATABASE "${databaseName}"`);
        databaseCreated = true;

        const testUrl = new URL(adminUrl);
        testUrl.pathname = `/${databaseName}`;
        testUrl.searchParams.set('schema', 'public');

        const databaseUrl = testUrl.toString();

        const runtimeUrl = new URL(testUrl);
        runtimeUrl.username = 'sls_app';
        runtimeUrl.password = 'sls_app_dev_password';

        const runtimeDatabaseUrl = runtimeUrl.toString();

        run(
            'npx',
            ['prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'],
            {
                DATABASE_URL: databaseUrl,
                RUNTIME_DATABASE_URL: databaseUrl,
            },
        );

        run(
            'npx',
            [
                'jest',
                '--config',
                './test/jest-e2e.json',
                '--runInBand',
                'test/pkg-geo-01.e2e-spec.ts',
            ],
            {
                DATABASE_URL: databaseUrl,
                RUNTIME_DATABASE_URL: runtimeDatabaseUrl,
                PROVISIONING_DATABASE_URL: databaseUrl,
                NODE_OPTIONS: [
                    process.env.NODE_OPTIONS,
                    '--experimental-vm-modules',
                ]
                    .filter(Boolean)
                    .join(' '),
            },
        );

        console.log(
            'PASS PKG-GEO-01: package geocoding and network attachment lifecycle with tenant isolation and atomicity',
        );
    } finally {
        if (databaseCreated) {
            if (process.env.KEEP_PKGGEO01_TEST_DB === '1') {
                console.log(`Keeping disposable database ${databaseName}`);
            } else {
                await control.query(
                    `
                        SELECT pg_terminate_backend(pid)
                        FROM pg_stat_activity
                        WHERE datname = $1
                        AND pid <> pg_backend_pid()
                    `,
                    [databaseName],
                );

                await control.query(`DROP DATABASE "${databaseName}"`);
                console.log(`Dropped disposable database ${databaseName}`);
            }
        }

        await control.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
