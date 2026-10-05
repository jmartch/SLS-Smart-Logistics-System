import { Injectable } from '@nestjs/common';
import { TenantProvisioningRepository } from '../domain/tenant-provisioning.repository';
import type { ProvisionTenantResult } from '../domain/provision-tenant.types';
import { DEFAULT_ROLES } from '../domain/default-roles';
import { slugify } from '../domain/tenant-slug';
import { hashPassword } from '../../auth/domain/password-hasher';

export interface ProvisionTenantCommand {
  readonly name: string;
  readonly adminEmail: string;
  readonly adminPassword: string;
  // Taken from the authenticated session, never from the request body.
  readonly actorPlatformAdminId: string;
}

@Injectable()
export class ProvisionTenantService {
  constructor(private readonly repository: TenantProvisioningRepository) {}

  async provision(
    command: ProvisionTenantCommand,
  ): Promise<ProvisionTenantResult> {
    const name = command.name.trim();
    const slug = slugify(name);

    if (slug.length === 0) {
      return { kind: 'INVALID_NAME' };
    }

    // Login lookups are case-sensitive, so the email is stored normalized.
    const adminEmail = command.adminEmail.trim().toLowerCase();
    const adminPasswordHash = await hashPassword(command.adminPassword);

    const outcome = await this.repository.provision({
      name,
      slug,
      adminEmail,
      adminPasswordHash,
      roles: DEFAULT_ROLES,
      actorPlatformAdminId: command.actorPlatformAdminId,
    });

    if (outcome.kind === 'SLUG_ALREADY_EXISTS') {
      return outcome;
    }

    return { kind: 'OK', tenantId: outcome.tenantId, slug };
  }
}
