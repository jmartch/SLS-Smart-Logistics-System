import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  SessionRepository,
  type SessionActor,
  type SessionRecord,
} from '../domain/session.repository';

function toActor(row: {
  actorType: string;
  tenantId: string | null;
  userId: string | null;
  platformAdminId: string | null;
}): SessionActor {
  if (row.actorType === 'PLATFORM_ADMIN' && row.platformAdminId) {
    return {
      actorType: 'PLATFORM_ADMIN',
      platformAdminId: row.platformAdminId,
    };
  }

  if (row.actorType === 'TENANT_USER' && row.tenantId && row.userId) {
    return {
      actorType: 'TENANT_USER',
      tenantId: row.tenantId,
      userId: row.userId,
    };
  }

  throw new Error(`Malformed session row: actorType=${row.actorType}`);
}

// Session has no RLS (sessions are resolved before any tenant context exists),
// so this is the one repository that queries without runWithTenant.
@Injectable()
export class PrismaSessionRepository extends SessionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    actor: SessionActor,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<SessionRecord> {
    const row = await this.prisma.session.create({
      data: {
        tokenHash,
        expiresAt,
        actorType: actor.actorType,
        tenantId: actor.actorType === 'TENANT_USER' ? actor.tenantId : null,
        userId: actor.actorType === 'TENANT_USER' ? actor.userId : null,
        platformAdminId:
          actor.actorType === 'PLATFORM_ADMIN' ? actor.platformAdminId : null,
      },
    });

    return { id: row.id, actor, expiresAt: row.expiresAt };
  }

  async findActiveByTokenHash(
    tokenHash: string,
  ): Promise<SessionRecord | null> {
    const row = await this.prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!row) {
      return null;
    }

    return { id: row.id, actor: toActor(row), expiresAt: row.expiresAt };
  }

  async touch(sessionId: string, expiresAt: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt, lastUsedAt: new Date() },
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(tenantId: string, userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
