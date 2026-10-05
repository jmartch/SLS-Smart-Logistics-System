import { ProvisionTenantService } from './provision-tenant.service';
import type { TenantProvisioningRepository } from '../domain/tenant-provisioning.repository';
import type {
  ProvisionTenantInput,
  TenantProvisioningOutcome,
} from '../domain/provision-tenant.types';
import { DEFAULT_ROLES } from '../domain/default-roles';
import { verifyPassword } from '../../auth/domain/password-hasher';

const PLAIN_PASSWORD = 'first admin password';

// Typed as a plain object with a mock property (structurally a
// TenantProvisioningRepository) so assertions on it are not unbound methods.
function repositoryReturning(outcome: TenantProvisioningOutcome): {
  provision: jest.Mock;
} {
  return { provision: jest.fn().mockResolvedValue(outcome) };
}

function command(overrides: Partial<Record<string, string>> = {}) {
  return {
    name: 'Logística Norte SAS',
    adminEmail: '  Owner@Norte.TEST ',
    adminPassword: PLAIN_PASSWORD,
    actorPlatformAdminId: 'platform-admin-1',
    ...overrides,
  };
}

function inputOf(repository: { provision: jest.Mock }): ProvisionTenantInput {
  expect(repository.provision).toHaveBeenCalledTimes(1);
  return (repository.provision.mock.calls[0] as [ProvisionTenantInput])[0];
}

describe('ProvisionTenantService', () => {
  it('returns the new tenant id and the computed slug', async () => {
    const repository = repositoryReturning({ kind: 'OK', tenantId: 't-1' });
    const service = new ProvisionTenantService(repository);

    const result = await service.provision(command());

    expect(result).toEqual({
      kind: 'OK',
      tenantId: 't-1',
      slug: 'logistica-norte-sas',
    });
  });

  it('passes the slug, trimmed name, normalized email, actor and default role catalog', async () => {
    const repository = repositoryReturning({ kind: 'OK', tenantId: 't-1' });
    const service = new ProvisionTenantService(repository);

    await service.provision(command({ name: '  Logística Norte SAS ' }));

    const input = inputOf(repository);
    expect(input.name).toBe('Logística Norte SAS');
    expect(input.slug).toBe('logistica-norte-sas');
    expect(input.adminEmail).toBe('owner@norte.test');
    expect(input.actorPlatformAdminId).toBe('platform-admin-1');
    expect(input.roles).toBe(DEFAULT_ROLES);
  });

  it('hashes the password and never hands the plain password to the repository', async () => {
    const repository = repositoryReturning({ kind: 'OK', tenantId: 't-1' });
    const service = new ProvisionTenantService(repository);

    await service.provision(command());

    const input = inputOf(repository);
    expect(input.adminPasswordHash).toMatch(/^\$argon2/);
    await expect(
      verifyPassword(input.adminPasswordHash, PLAIN_PASSWORD),
    ).resolves.toBe(true);
    expect(JSON.stringify(input)).not.toContain(PLAIN_PASSWORD);
  });

  it('returns INVALID_NAME without touching the repository when the name has no usable characters', async () => {
    const repository = repositoryReturning({ kind: 'OK', tenantId: 't-1' });
    const service = new ProvisionTenantService(repository);

    const result = await service.provision(command({ name: '!!! ***' }));

    expect(result).toEqual({ kind: 'INVALID_NAME' });
    expect(repository.provision).not.toHaveBeenCalled();
  });

  it('passes SLUG_ALREADY_EXISTS through', async () => {
    const repository = repositoryReturning({ kind: 'SLUG_ALREADY_EXISTS' });
    const service = new ProvisionTenantService(repository);

    const result = await service.provision(command());

    expect(result).toEqual({ kind: 'SLUG_ALREADY_EXISTS' });
  });

  it('propagates unexpected repository failures', async () => {
    const repository: TenantProvisioningRepository = {
      provision: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const service = new ProvisionTenantService(repository);

    await expect(service.provision(command())).rejects.toThrow('db down');
  });
});

describe('DEFAULT_ROLES', () => {
  it('grants Administrador all six permissions and every other role exactly one', () => {
    const byName = new Map(DEFAULT_ROLES.map((r) => [r.name, r]));

    expect([...byName.keys()].sort()).toEqual(
      [
        'Administrador',
        'Clasificacion',
        'Coordinador de ruta',
        'Mensajero',
        'Recepcion',
      ].sort(),
    );
    expect(
      [...(byName.get('Administrador')?.permissionCodes ?? [])].sort(),
    ).toEqual([
      'CLASSIFY_PACKAGES',
      'COORDINATE_ROUTES',
      'MANAGE_EMPLOYEES',
      'MANAGE_TENANT',
      'OPERATE_DELIVERIES',
      'REGISTER_PACKAGES',
    ]);
    expect(byName.get('Recepcion')?.permissionCodes).toEqual([
      'REGISTER_PACKAGES',
    ]);
    expect(byName.get('Clasificacion')?.permissionCodes).toEqual([
      'CLASSIFY_PACKAGES',
    ]);
    expect(byName.get('Coordinador de ruta')?.permissionCodes).toEqual([
      'COORDINATE_ROUTES',
    ]);
    expect(byName.get('Mensajero')?.permissionCodes).toEqual([
      'OPERATE_DELIVERIES',
    ]);
  });

  it('assigns only the Administrador role to the first admin', () => {
    expect(
      DEFAULT_ROLES.filter((r) => r.grantedToFirstAdmin).map((r) => r.name),
    ).toEqual(['Administrador']);
  });
});
