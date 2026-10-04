import { Injectable } from '@nestjs/common';
import { SessionRepository } from '../domain/session.repository';
import { hashSessionToken } from '../domain/session-token';

@Injectable()
export class LogoutService {
  constructor(private readonly sessions: SessionRepository) {}

  async logout(rawToken: string): Promise<void> {
    const session = await this.sessions.findActiveByTokenHash(
      hashSessionToken(rawToken),
    );

    if (session) {
      await this.sessions.revoke(session.id);
    }
  }
}
