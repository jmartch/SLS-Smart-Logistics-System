import { Injectable } from '@nestjs/common';
import { TenantUserLookupRepository } from '../domain/tenant-user-lookup.repository';
import { SessionRepository } from '../domain/session.repository';
import { verifyPassword } from '../domain/password-hasher';
import { verifyAgainstDummyHash } from '../domain/dummy-password-verification';
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
      // Pays for one verification so timing does not reveal whether the
      // tenant slug or email exists.
      await verifyAgainstDummyHash(input.password);
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
