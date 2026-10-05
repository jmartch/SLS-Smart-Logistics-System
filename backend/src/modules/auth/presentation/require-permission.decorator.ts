import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'sls:requiredPermission';

// Declares the tenant permission a route needs. Enforced by PermissionsGuard,
// which must run after AuthGuard: @UseGuards(AuthGuard, PermissionsGuard).
// Usable on a controller class (applies to every handler) or on a handler
// (overrides the class-level value).
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
