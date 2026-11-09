export const PACKAGE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type PackagePriority = (typeof PACKAGE_PRIORITIES)[number];

export const ROAD_PROFILES = [
  'MOTOR_VEHICLE',
  'MOTORCYCLE',
  'BICYCLE',
  'FOOT',
] as const;
export type RoadProfile = (typeof ROAD_PROFILES)[number];

export const ROAD_PROFILE_LABELS: Record<RoadProfile, string> = {
  MOTOR_VEHICLE: 'Vehículo a motor',
  MOTORCYCLE: 'Motocicleta',
  BICYCLE: 'Bicicleta',
  FOOT: 'A pie',
};

export const GEOCODING_STATUSES = [
  'MATCHED',
  'REVIEW_REQUIRED',
  'NOT_FOUND',
  'DATASET_NOT_READY',
  'UNSUPPORTED_ADDRESS_FORMAT',
  'NETWORK_ATTACHMENT_NOT_READY',
] as const;
export type PackageGeocodingResolutionStatus =
  (typeof GEOCODING_STATUSES)[number];

export const GEOCODING_STATUS_LABELS: Record<
  PackageGeocodingResolutionStatus,
  string
> = {
  MATCHED: 'Geocodificado',
  REVIEW_REQUIRED: 'Requiere revisión',
  NOT_FOUND: 'Dirección no encontrada',
  DATASET_NOT_READY: 'Catálogo no listo',
  UNSUPPORTED_ADDRESS_FORMAT: 'Formato no soportado',
  NETWORK_ATTACHMENT_NOT_READY: 'Anclaje vial no disponible',
};

export const GEOCODING_STATUS_MESSAGES: Record<
  PackageGeocodingResolutionStatus,
  string
> = {
  MATCHED:
    'La dirección se resolvió de acuerdo con el catálogo geográfico y se ancló a la red vial del municipio.',
  REVIEW_REQUIRED:
    'Se encontraron múltiples candidatos ambiguos. Se requiere seleccionar y aprobar un candidato para planificar.',
  NOT_FOUND:
    'No se encontraron coordenadas en el catálogo geográfico para esta dirección. Requiere corrección o revisión.',
  DATASET_NOT_READY:
    'El catálogo geográfico o dataset de red vial del municipio no está listo o no está configurado para la empresa.',
  UNSUPPORTED_ADDRESS_FORMAT:
    'La nomenclatura o texto de dirección no tiene una estructura reconocible. Requiere corrección manual.',
  NETWORK_ATTACHMENT_NOT_READY:
    'La coordenada no se pudo anclar a un segmento o nodo vial transitable dentro del radio permitido.',
};

export const GEOCODING_STATUS_COLORS: Record<
  PackageGeocodingResolutionStatus,
  string
> = {
  MATCHED: 'status--ok',
  REVIEW_REQUIRED: 'status--warn',
  NOT_FOUND: 'status--danger',
  DATASET_NOT_READY: 'status--danger',
  UNSUPPORTED_ADDRESS_FORMAT: 'status--danger',
  NETWORK_ATTACHMENT_NOT_READY: 'status--warn',
};

export type PackageGeocodingEligibility = 'ELIGIBLE' | 'INELIGIBLE';

export type NetworkAttachmentStatus =
  | 'AUTO_ACCEPTED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED';

export const NETWORK_ATTACHMENT_STATUS_LABELS: Record<
  NetworkAttachmentStatus,
  string
> = {
  AUTO_ACCEPTED: 'Anclaje automático',
  REVIEW_REQUIRED: 'Anclaje en revisión',
  APPROVED: 'Anclaje aprobado',
  REJECTED: 'Anclaje rechazado',
};

export interface PackageGeocodingDiagnostic {
  readonly status: PackageGeocodingResolutionStatus;
  readonly eligibility: PackageGeocodingEligibility;
  readonly attemptId: string | null;
  readonly selectedCandidateId: string | null;
  readonly attachmentId: string | null;
  readonly attachmentStatus: NetworkAttachmentStatus | null;
  readonly unsuitabilityReason: string | null;
  readonly datasetId: string | null;
  readonly profile: RoadProfile | null;
  readonly directedReachabilityVerified: boolean;
}

export interface GeocodingCandidateItem {
  readonly id: string;
  readonly rank: number;
  readonly score: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly precision: string;
  readonly source: string;
}

export interface ResolvePackageGeocodingPayload {
  readonly expectedAttemptId?: string | null;
  readonly forceRetry?: boolean;
  readonly operationId?: string;
}

export interface ReviewPackageGeocodingPayload {
  readonly expectedAddressId: string;
  readonly expectedAttemptId: string;
  readonly candidateId: string;
  readonly decision: 'APPROVED' | 'REJECTED';
  readonly reason: string;
  readonly operationId?: string;
}

export interface CorrectPackageAddressPayload {
  readonly expectedAddressId: string;
  readonly newOriginalText: string;
  readonly newMunicipalityCode: string;
  readonly reason: string;
  readonly expectedAttemptId?: string | null;
}

export interface CorrectPackageAddressResult {
  readonly packageId: string;
  readonly previousAddressId: string;
  readonly newAddressId: string;
  readonly geocoding: PackageGeocodingDiagnostic;
}

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
  readonly geocoding?: PackageGeocodingDiagnostic | null;
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
