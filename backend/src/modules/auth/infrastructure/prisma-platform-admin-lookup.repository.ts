import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PlatformAdminLookup } from '../domain/platform-admin-lookup.repository';

// PlatformAdmin is not tenant-owned and has no RLS; the runtime role (sls_app)
// has SELECT only, which is all session resolution needs.
@Injectable()
export class PrismaPlatformAdminLookup extends PlatformAdminLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isActive(platformAdminId: string): Promise<boolean> {
    const count = await this.prisma.platformAdmin.count({
      where: { id: platformAdminId, status: 'ACTIVE' },
    });

    return count > 0;
  }

  async findEmail(platformAdminId: string): Promise<string | null> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: platformAdminId },
      select: { email: true },
    });

    return admin?.email ?? null;
  }
}
