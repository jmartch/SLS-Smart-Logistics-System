import { Injectable } from '@nestjs/common';
import { TenantUserLookupRepository } from '../domain/tenant-user-lookup.repository';
import { SessionRepository } from '../domain/session.repository';
import { hashPassword, verifyPassword } from '../domain/password-hasher';
import { generateSessionToken } from '../domain/session-token';
import { SESSION_TTL_MS } from '../domain/session-policy';

export interface LoginInput {
  readonly slug: string;
  readonly email: string;
  readonly password: string;
}

export type LoginResult =
  | { readonly kind: 'OK'; readonly rawToken: string; readonly expiresAt: Date }
  | { readonly kind: 'INVALID_CREDENTIALS' };

// Failure paths that skip the real hash still pay for one argon2 verification
// against this throwaway hash, so response time does not reveal whether a
// tenant slug or email exists. Computed once, on first use.
let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword('sls-dummy-password-for-timing-parity');
  return dummyPasswordHash;
}

@Injectable()
export class LoginTenantUserService {
  constructor(
    private readonly lookup: TenantUserLookupRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    // Lookups are case-sensitive; slugs and emails are stored normalized.
    const slug = input.slug.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();

    const tenant = await this.lookup.findTenantBySlug(slug);
    const user =
      tenant && tenant.status === 'ACTIVE'
        ? await this.lookup.findUserForLogin(tenant.id, email)
        : null;

    if (!user || user.status !== 'ACTIVE') {
      await verifyPassword(await getDummyPasswordHash(), input.password);
      return { kind: 'INVALID_CREDENTIALS' };
    }

    const passwordMatches = await verifyPassword(
      user.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      return { kind: 'INVALID_CREDENTIALS' };
    }

    const { rawToken, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.create(
      { actorType: 'TENANT_USER', tenantId: user.tenantId, userId: user.id },
      tokenHash,
      expiresAt,
    );

    return { kind: 'OK', rawToken, expiresAt };
  }
}
