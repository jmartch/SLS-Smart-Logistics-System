export type ActorContext =
  | {
      readonly kind: 'TENANT_USER';
      readonly tenantId: string;
      readonly userId: string;
      readonly permissions: ReadonlySet<string>;
    }
  | {
      readonly kind: 'PLATFORM_ADMIN';
      readonly platformAdminId: string;
    };
