const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

if (!process.env.GDB_TEST_ADMIN_URL) {
    throw new Error('GDB_TEST_ADMIN_URL is required');
}

const adminUrl = new URL(process.env.GDB_TEST_ADMIN_URL);
const control = new Pool({
    connectionString: adminUrl.toString(),
});

const databaseName =
    'sls_authtenant01_' + randomUUID().replaceAll('-', '').toLowerCase();
const provisioningPassword =
    'prov_' + randomUUID().replaceAll('-', '').toLowerCase();

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

        // Configure ephemeral LOGIN credential for sls_provisioning (created NOLOGIN in migration).
        await control.query(
            `ALTER ROLE sls_provisioning WITH LOGIN PASSWORD '${provisioningPassword}'`,
        );

        const provisioningUrl = new URL(testUrl);
        provisioningUrl.username = 'sls_provisioning';
        provisioningUrl.password = provisioningPassword;
        const provisioningDatabaseUrl = provisioningUrl.toString();

        run(
            'npx',
            ['prisma', 'migrate', 'status', '--config', 'prisma7.config.ts'],
            {
                DATABASE_URL: databaseUrl,
                RUNTIME_DATABASE_URL: databaseUrl,
            },
        );

        const testEnv = {
            DATABASE_URL: databaseUrl,
            RUNTIME_DATABASE_URL: runtimeDatabaseUrl,
            PROVISIONING_DATABASE_URL: provisioningDatabaseUrl,
            NODE_OPTIONS: [
                process.env.NODE_OPTIONS,
                '--experimental-vm-modules',
            ]
                .filter(Boolean)
                .join(' '),
        };

        // 1. Repository integration suites (RLS, grants, Session CHECK, advisory locks)
        run(
            'npx',
            [
                'jest',
                '--runInBand',
                '--testPathIgnorePatterns=/node_modules/',
                '--runTestsByPath',
                'src/modules/auth/infrastructure/prisma-platform-admin-lookup.repository.spec.ts',
                'src/modules/auth/infrastructure/prisma-session.repository.spec.ts',
                'src/modules/auth/infrastructure/prisma-tenant-user-lookup.repository.spec.ts',
                'src/modules/platform/infrastructure/prisma-tenant-provisioning.repository.spec.ts',
                'src/modules/users/infrastructure/prisma-user-management.repository.spec.ts',
            ],
            testEnv,
        );

        // 2. HTTP E2E suites under real configureApp (/api/v1)
        run(
            'npx',
            [
                'jest',
                '--config',
                './test/jest-e2e.json',
                '--runInBand',
                '--runTestsByPath',
                'test/auth-login.e2e-spec.ts',
                'test/platform-login.e2e-spec.ts',
                'test/platform-provision-tenant.e2e-spec.ts',
                'test/users-employees.e2e-spec.ts',
                'test/auth-tenant-isolation.e2e-spec.ts',
                'test/tenant-isolation.e2e-spec.ts',
            ],
            testEnv,
        );

        console.log(
            'PASS AUTH-TENANT-01: authentication, provisioning, employee management and multi-tenant RLS isolation',
        );
    } finally {
        if (databaseCreated) {
            if (process.env.KEEP_AUTHTENANT01_TEST_DB === '1') {
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
                await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
                console.log(`Dropped disposable database ${databaseName}`);
            }
        }

        await control.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
