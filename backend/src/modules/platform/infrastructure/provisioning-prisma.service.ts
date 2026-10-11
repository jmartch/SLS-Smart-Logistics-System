import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../generated/prisma/client';

// Connection as the sls_provisioning role, the only role allowed to create
// tenants. Deliberately registered only in PlatformModule (not in the global
// PrismaModule and not exported) so no other module can acquire it.
@Injectable()
export class ProvisioningPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.PROVISIONING_DATABASE_URL;
    // Fail fast: without an explicit URL the pg driver would fall back to
    // PG* environment defaults and could connect as an unintended role.
    if (!connectionString) {
      throw new Error('PROVISIONING_DATABASE_URL is not set.');
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
