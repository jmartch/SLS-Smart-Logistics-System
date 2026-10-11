import { Injectable } from '@nestjs/common';
import {
  TenantUserLookupRepository,
  type RoleSummary,
} from '../domain/tenant-user-lookup.repository';
import { PlatformAdminLookup } from '../domain/platform-admin-lookup.repository';
import type { ActorContext } from '../../../shared/application/actor-context';

export type CurrentIdentity =
  | {
      readonly kind: 'TENANT_USER';
      readonly userId: string;
      readonly tenantId: string;
      readonly email: string;
      readonly roles: readonly RoleSummary[];
      readonly permissions: readonly string[];
    }
  | {
      readonly kind: 'PLATFORM_ADMIN';
      readonly platformAdminId: string;
      readonly email: string;
    };

// Backs GET /api/auth/me (spec section 6.3). Every identifier comes from the
// actor that AuthGuard resolved from the session row, never from the request.
@Injectable()
export class GetCurrentIdentityService {
  constructor(
    private readonly lookup: TenantUserLookupRepository,
    private readonly platformAdmins: PlatformAdminLookup,
  ) {}

  // null when the actor vanished between session resolution and this read.
  async get(actor: ActorContext): Promise<CurrentIdentity | null> {
    if (actor.kind === 'PLATFORM_ADMIN') {
      const email = await this.platformAdmins.findEmail(actor.platformAdminId);

      return email === null
        ? null
        : {
            kind: 'PLATFORM_ADMIN',
            platformAdminId: actor.platformAdminId,
            email,
          };
    }

    const profile = await this.lookup.findUserProfile(
      actor.tenantId,
      actor.userId,
    );

    if (!profile) {
      return null;
    }

    return {
      kind: 'TENANT_USER',
      userId: actor.userId,
      tenantId: actor.tenantId,
      email: profile.email,
      roles: profile.roles,
      // The permissions AuthGuard loaded for this very request, sorted so the
      // contract is stable.
      permissions: [...actor.permissions].sort(),
    };
  }
}
