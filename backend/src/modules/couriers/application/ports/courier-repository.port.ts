export type CourierUserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type CourierStatusValue = 'ACTIVE' | 'INACTIVE';

/** Solo lo necesario para decidir elegibilidad: nunca datos de credenciales. */
export interface CourierUserSnapshot {
  readonly id: string;
  readonly status: CourierUserStatus;
}

export interface CourierEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly status: CourierStatusValue;
}

export type CreateCourierResult =
  | {
      readonly ok: true;
      readonly courier: CourierEntry;
    }
  | {
      readonly ok: false;
      readonly code: 'COURIER_USER_ALREADY_LINKED';
    };

export interface CourierRepositoryPort {
  findUserByTenant(
    tenantId: string,
    userId: string,
  ): Promise<CourierUserSnapshot | null>;

  createByTenant(
    tenantId: string,
    data: { readonly userId: string },
  ): Promise<CreateCourierResult>;
}
