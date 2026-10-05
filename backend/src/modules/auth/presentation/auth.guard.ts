import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ResolveSessionService } from '../application/resolve-session.service';
import { TenantUserLookupRepository } from '../domain/tenant-user-lookup.repository';
import { PlatformAdminLookup } from '../domain/platform-admin-lookup.repository';
import type { ActorContext } from '../../../shared/application/actor-context';

export const SESSION_COOKIE_NAME = 'sls_session';

// Every guarded route re-checks, from the database, that the session's actor
// may still act (tenant user and tenant ACTIVE, or platform admin ACTIVE): a
// session that outlived a deactivation, or a failed revocation, answers 401.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly resolveSession: ResolveSessionService,
    private readonly lookup: TenantUserLookupRepository,
    private readonly platformAdmins: PlatformAdminLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    // request.cookies is undefined until cookie-parser is registered; that
    // is treated as "no session" rather than an error. The value is validated
    // as a string because cookie-parser JSON-decodes cookies starting with
    // "j:", so a client can make it an object or number.
    const rawToken: unknown = (
      request.cookies as Record<string, unknown> | undefined
    )?.[SESSION_COOKIE_NAME];

    if (typeof rawToken !== 'string' || rawToken.length === 0) {
      throw new UnauthorizedException({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'No hay sesion activa.',
          fields: null,
        },
      });
    }

    // The tenant comes only from the stored session row, via the loader
    // arguments; no header, query, or body value is ever consulted.
    const actor = await this.resolveSession.resolve(rawToken, {
      loadTenantUserPermissions: (tenantId, userId) =>
        this.lookup.findPermissionsForUser(tenantId, userId),
      isPlatformAdminActive: (platformAdminId) =>
        this.platformAdmins.isActive(platformAdminId),
    });

    if (!actor) {
      throw new UnauthorizedException({
        error: {
          code: 'SESSION_EXPIRED',
          message: 'La sesion expiro o fue revocada.',
          fields: null,
        },
      });
    }

    (request as Request & { actor?: ActorContext }).actor = actor;
    return true;
  }
}
