import { GetCurrentIdentityService } from './get-current-identity.service';
import type {
  TenantUserLookupRepository,
  TenantUserProfile,
} from '../domain/tenant-user-lookup.repository';
import type { PlatformAdminLookup } from '../domain/platform-admin-lookup.repository';
import type { ActorContext } from '../../../shared/application/actor-context';

function build(options: {
  profile?: TenantUserProfile | null;
  platformEmail?: string | null;
}) {
  const findUserProfile = jest
    .fn()
    .mockResolvedValue(options.profile === undefined ? null : options.profile);
  const findEmail = jest
    .fn()
    .mockResolvedValue(
      options.platformEmail === undefined ? null : options.platformEmail,
    );
  const lookup: TenantUserLookupRepository = {
    findTenantBySlug: jest.fn(),
    findUserForLogin: jest.fn(),
    findPermissionsForUser: jest.fn(),
    findUserProfile,
  };
  const platformAdmins: PlatformAdminLookup = {
    isActive: jest.fn(),
    findEmail,
  };

  return {
    service: new GetCurrentIdentityService(lookup, platformAdmins),
    findUserProfile,
    findEmail,
  };
}

const tenantActor: ActorContext = {
  kind: 'TENANT_USER',
  tenantId: 'tenant-a',
  userId: 'user-a',
  permissions: new Set(['REGISTER_PACKAGES', 'MANAGE_EMPLOYEES']),
};

describe('GetCurrentIdentityService', () => {
  it('returns the tenant user identity with email, roles and the session permissions', async () => {
    const { service, findUserProfile, findEmail } = build({
      profile: {
        email: 'owner@a.test',
        roles: [{ id: 'role-1', name: 'Administrador' }],
      },
    });

    await expect(service.get(tenantActor)).resolves.toEqual({
      kind: 'TENANT_USER',
      userId: 'user-a',
      tenantId: 'tenant-a',
      email: 'owner@a.test',
      roles: [{ id: 'role-1', name: 'Administrador' }],
      // Sorted for a stable contract.
      permissions: ['MANAGE_EMPLOYEES', 'REGISTER_PACKAGES'],
    });
    // Tenant and user come only from the resolved session actor.
    expect(findUserProfile).toHaveBeenCalledWith('tenant-a', 'user-a');
    expect(findEmail).not.toHaveBeenCalled();
  });

  it('returns an empty roles list for a user without roles', async () => {
    const { service } = build({
      profile: { email: 'courier@a.test', roles: [] },
    });

    const identity = await service.get({
      ...tenantActor,
      permissions: new Set(),
    });

    expect(identity).toMatchObject({ roles: [], permissions: [] });
  });

  it('returns null when the tenant user profile no longer exists', async () => {
    const { service } = build({ profile: null });

    await expect(service.get(tenantActor)).resolves.toBeNull();
  });

  it('returns the platform admin identity with its email', async () => {
    const { service, findEmail, findUserProfile } = build({
      platformEmail: 'root@platform.test',
    });

    await expect(
      service.get({ kind: 'PLATFORM_ADMIN', platformAdminId: 'admin-1' }),
    ).resolves.toEqual({
      kind: 'PLATFORM_ADMIN',
      platformAdminId: 'admin-1',
      email: 'root@platform.test',
    });
    expect(findEmail).toHaveBeenCalledWith('admin-1');
    expect(findUserProfile).not.toHaveBeenCalled();
  });

  it('returns null when the platform admin no longer exists', async () => {
    const { service } = build({ platformEmail: null });

    await expect(
      service.get({ kind: 'PLATFORM_ADMIN', platformAdminId: 'admin-1' }),
    ).resolves.toBeNull();
  });
});
