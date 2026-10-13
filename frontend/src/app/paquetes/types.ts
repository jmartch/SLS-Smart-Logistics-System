// Tipos alineados a backend/prisma/schema/packages.prisma, catalog.prisma
// y backend/src/modules/packages/presentation/dto/register-package.dto.ts.
// No se usa `enum` de TypeScript: tsconfig.app.json tiene `erasableSyntaxOnly`.

export const PACKAGE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type PackagePriority = (typeof PACKAGE_PRIORITIES)[number];

export const PACKAGE_PRIORITY_LABELS: Record<PackagePriority, string> = {
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const PACKAGE_STATES = [
  'REGISTERED',
  'CLASSIFIED',
  'PENDING_ASSIGNMENT',
  'ASSIGNED_TO_ROUTE',
  'READY_FOR_DISPATCH',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RESCHEDULED',
  'RETURN_PENDING',
  'RETURNED',
  'CANCELLED',
] as const;
export type PackageState = (typeof PACKAGE_STATES)[number];

export const PACKAGE_STATE_LABELS: Record<PackageState, string> = {
  REGISTERED: 'Registrado',
  CLASSIFIED: 'Clasificado',
  PENDING_ASSIGNMENT: 'Pendiente de asignación',
  ASSIGNED_TO_ROUTE: 'Asignado a ruta',
  READY_FOR_DISPATCH: 'Listo para despacho',
  IN_TRANSIT: 'En tránsito',
  OUT_FOR_DELIVERY: 'En reparto',
  DELIVERED: 'Entregado',
  DELIVERY_FAILED: 'Entrega fallida',
  RESCHEDULED: 'Reprogramado',
  RETURN_PENDING: 'Pendiente de devolución',
  RETURNED: 'Devuelto',
  CANCELLED: 'Cancelado',
};

export const PACKAGE_STATE_COLORS: Record<PackageState, string> = {
  REGISTERED: 'status--muted',
  CLASSIFIED: 'status--info',
  PENDING_ASSIGNMENT: 'status--warn',
  ASSIGNED_TO_ROUTE: 'status--info',
  READY_FOR_DISPATCH: 'status--info',
  IN_TRANSIT: 'status--warn',
  OUT_FOR_DELIVERY: 'status--warn',
  DELIVERED: 'status--ok',
  DELIVERY_FAILED: 'status--danger',
  RESCHEDULED: 'status--warn',
  RETURN_PENDING: 'status--danger',
  RETURNED: 'status--muted',
  CANCELLED: 'status--muted',
};

export interface CatalogOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface ShipmentTypeOption extends CatalogOption {
  readonly active?: boolean;
}

export interface SectorOption extends CatalogOption {
  readonly zoneId: string;
}

/** Estado del formulario de registro de paquetes. */
export interface RegisterPackageFormValues {
  trackingCode: string;
  sender: string;
  recipient: string;
  recipientAddress: string;
  recipientPhone: string;
  municipalityCode: string;
  shipmentTypeId: string;
  zoneId: string;
  sectorId: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  priority: PackagePriority;
  deadline: string;
  notes: string;
}

export type RegisterPackageFormErrors = Partial<
  Record<keyof RegisterPackageFormValues, string>
>;

/** Contrato real para POST /api/v1/packages (RegisterPackageDto). */
export interface RegisterPackagePayload {
  readonly trackingCode: string;
  readonly address: {
    readonly text: string;
    readonly municipalityCode: string;
  };
  readonly shipmentTypeId: string;
  readonly zoneId?: string;
  readonly sectorId?: string;
  readonly weightKg: number;
  readonly lengthCm: number;
  readonly widthCm: number;
  readonly heightCm: number;
  readonly priority?: PackagePriority;
  readonly deadline?: string;
  readonly serviceDurationSeconds?: number;
}

export interface RegisterPackageResult {
  readonly id: string;
  readonly trackingCode: string;
  readonly state: PackageState;
}

export const EMPTY_REGISTER_PACKAGE_FORM: RegisterPackageFormValues = {
  trackingCode: '',
  sender: '',
  recipient: '',
  recipientAddress: '',
  recipientPhone: '',
  municipalityCode: '08001',
  shipmentTypeId: '',
  zoneId: '',
  sectorId: '',
  weightKg: '',
  lengthCm: '30',
  widthCm: '20',
  heightCm: '15',
  priority: 'NORMAL',
  deadline: '',
  notes: '',
};
