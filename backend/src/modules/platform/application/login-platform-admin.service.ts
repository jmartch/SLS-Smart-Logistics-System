import { Injectable } from '@nestjs/common';
import { PlatformAdminRepository } from '../domain/platform-admin.repository';
import { SessionRepository } from '../../auth/domain/session.repository';
import { verifyPassword } from '../../auth/domain/password-hasher';
import { verifyAgainstDummyHash } from '../../auth/domain/dummy-password-verification';
import { generateSessionToken } from '../../auth/domain/session-token';
import { SESSION_TTL_MS } from '../../auth/domain/session-policy';

export interface PlatformLoginInput {
  readonly email: string;
  readonly password: string;
}

export type PlatformLoginResult =
  | { readonly kind: 'OK'; readonly rawToken: string; readonly expiresAt: Date }
  | { readonly kind: 'INVALID_CREDENTIALS' };

@Injectable()
export class LoginPlatformAdminService {
  constructor(
    private readonly repository: PlatformAdminRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async login(input: PlatformLoginInput): Promise<PlatformLoginResult> {
    // Lookups are case-sensitive; emails are stored normalized.
    const email = input.email.trim().toLowerCase();

    const admin = await this.repository.findByEmail(email);

    if (!admin || admin.status !== 'ACTIVE') {
      // Pays for one verification so timing does not reveal whether the
      // email exists or the admin is active.
      await verifyAgainstDummyHash(input.password);
      return { kind: 'INVALID_CREDENTIALS' };
    }

    const passwordMatches = await verifyPassword(
      admin.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      return { kind: 'INVALID_CREDENTIALS' };
    }

    const { rawToken, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.create(
      { actorType: 'PLATFORM_ADMIN', platformAdminId: admin.id },
      tokenHash,
      expiresAt,
    );

    return { kind: 'OK', rawToken, expiresAt };
  }
}
