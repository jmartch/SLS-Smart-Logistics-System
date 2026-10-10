import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  PlatformAdminRepository,
  type PlatformAdminForLogin,
} from '../domain/platform-admin.repository';

// PlatformAdmin is not tenant-owned and has no RLS; sls_app has SELECT only.
@Injectable()
export class PrismaPlatformAdminRepository extends PlatformAdminRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByEmail(email: string): Promise<PlatformAdminForLogin | null> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, status: true },
    });

    return admin;
  }
}
