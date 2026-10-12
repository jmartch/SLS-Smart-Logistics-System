import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
  CourierRepositoryPort,
  CourierUserSnapshot,
  CreateCourierResult,
} from '../application/ports/courier-repository.port';

@Injectable()
export class PrismaCourierAdapter implements CourierRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByTenant(
    tenantId: string,
    userId: string,
  ): Promise<CourierUserSnapshot | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      // Solo id y status: nunca se lee passwordHash ni email.
      const user = await tx.user.findFirst({
        where: { tenantId, id: userId },
        select: { id: true, status: true },
      });

      return user;
    });
  }

  async createByTenant(
    tenantId: string,
    data: { readonly userId: string },
  ): Promise<CreateCourierResult> {
    try {
      const created = await runWithTenant(this.prisma, tenantId, async (tx) => {
        return tx.courier.create({
          data: { tenantId, userId: data.userId },
          select: { id: true, tenantId: true, userId: true, status: true },
        });
      });

      return { ok: true, courier: created };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { ok: false, code: 'COURIER_USER_ALREADY_LINKED' };
      }

      throw error;
    }
  }
}
