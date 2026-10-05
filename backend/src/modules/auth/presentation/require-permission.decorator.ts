import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'sls:requiredPermission';
export const AUTHENTICATED_ONLY_KEY = 'sls:authenticatedOnly';

// Declares the tenant permission a route needs. Enforced by PermissionsGuard,
// which must run after AuthGuard: @UseGuards(AuthGuard, PermissionsGuard).
// Usable on a controller class (applies to every handler) or on a handler
// (overrides the class-level value).
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

// Explicit opt-out for a route behind PermissionsGuard that intentionally
// needs only an authenticated actor (tenant user or platform admin). Without
// it or @RequirePermission, PermissionsGuard denies. It never loosens a
// permission declared at the handler or class level.
export const AuthenticatedOnly = () =>
  SetMetadata(AUTHENTICATED_ONLY_KEY, true);
