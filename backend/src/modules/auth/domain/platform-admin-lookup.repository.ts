// What session resolution needs to know about a platform admin. Owned by auth
// (not platform) because auth decides whether a session's actor may act.
export abstract class PlatformAdminLookup {
  // True only when the platform admin exists and is ACTIVE, read fresh.
  abstract isActive(platformAdminId: string): Promise<boolean>;
}
