export interface PlatformAdminForLogin {
  readonly id: string;
  readonly passwordHash: string;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

export abstract class PlatformAdminRepository {
  /** Looks up by the already-normalized (trimmed, lowercase) email. */
  abstract findByEmail(email: string): Promise<PlatformAdminForLogin | null>;
}
