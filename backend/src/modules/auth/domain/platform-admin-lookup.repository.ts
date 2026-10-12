// What session resolution and /api/auth/me need to know about a platform
// admin. Owned by auth (not platform) because auth decides whether a session's
// actor may act and what it may see about itself.
export abstract class PlatformAdminLookup {
  // True only when the platform admin exists and is ACTIVE, read fresh.
  abstract isActive(platformAdminId: string): Promise<boolean>;
  // null when the platform admin does not exist.
  abstract findEmail(platformAdminId: string): Promise<string | null>;
}
