// Tipos alineados a backend/prisma/schema/packages.prisma y catalog.prisma.
// No se usa `enum` de TypeScript: tsconfig.app.json tiene `erasableSyntaxOnly`,
// que exige construcciones sin emisión de runtime propia de TS.

export const PACKAGE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type PackagePriority = (typeof PACKAGE_PRIORITIES)[number];

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

export interface CatalogOption {
  id: string;
  code: string;
  name: string;
}

export interface SectorOption extends CatalogOption {
  zoneId: string;
}

/** Estado del formulario: todo string porque los <input> son controlados. */
export interface RegisterPackageFormValues {
  trackingCode: string;
  zoneId: string;
  sectorId: string;
  shipmentTypeId: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  priority: PackagePriority | '';
  deadline: string; // datetime-local; opcional según schema (deadline DateTime?)
  latitude: string;
  longitude: string;
}

export type RegisterPackageFormErrors = Partial<Record<keyof RegisterPackageFormValues, string>>;

/** Contrato provisional para POST /api/packages, pendiente de PKG-01/AUTH-01. */
export interface RegisterPackagePayload {
  trackingCode: string;
  zoneId: string;
  sectorId?: string;
  shipmentTypeId: string;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  priority: PackagePriority;
  deadline?: string; // ISO 8601
  latitude: number;
  longitude: number;
}

export interface RegisterPackageResult {
  id: string;
  trackingCode: string;
  state: PackageState;
}

export const EMPTY_REGISTER_PACKAGE_FORM: RegisterPackageFormValues = {
  trackingCode: '',
  zoneId: '',
  sectorId: '',
  shipmentTypeId: '',
  weightKg: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  priority: '',
  deadline: '',
  latitude: '',
  longitude: '',
};
