import type { RoleDefinition } from './provision-tenant.types';

// Roles seeded for every new tenant (spec section 4.4). Tenants may add or
// reorganize roles afterwards; this is only the starting catalog.
export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    name: 'Administrador',
    permissionCodes: [
      'MANAGE_TENANT',
      'MANAGE_EMPLOYEES',
      'REGISTER_PACKAGES',
      'CLASSIFY_PACKAGES',
      'COORDINATE_ROUTES',
      'OPERATE_DELIVERIES',
    ],
    grantedToFirstAdmin: true,
  },
  {
    name: 'Recepcion',
    permissionCodes: ['REGISTER_PACKAGES'],
    grantedToFirstAdmin: false,
  },
  {
    name: 'Clasificacion',
    permissionCodes: ['CLASSIFY_PACKAGES'],
    grantedToFirstAdmin: false,
  },
  {
    name: 'Coordinador de ruta',
    permissionCodes: ['COORDINATE_ROUTES'],
    grantedToFirstAdmin: false,
  },
  {
    name: 'Mensajero',
    permissionCodes: ['OPERATE_DELIVERIES'],
    grantedToFirstAdmin: false,
  },
];
