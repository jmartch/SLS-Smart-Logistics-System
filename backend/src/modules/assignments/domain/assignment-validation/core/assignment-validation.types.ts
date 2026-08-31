export interface AssignmentValidationContext {
  readonly tenantId: string;

  readonly package: {
    readonly id: string;
    readonly tenantId: string;
    readonly recipientAddress: string;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly zoneId: string | null;
    readonly weightKg: number;
    readonly volumeM3: number;
  };

  readonly vehicle: {
    readonly id: string;
    readonly tenantId: string;
    readonly available: boolean;
    readonly remainingWeightKg: number;
    readonly remainingVolumeM3: number;
    readonly supportedZoneIds: readonly string[];
  } | null;

  readonly courier: {
    readonly id: string;
    readonly tenantId: string;
    readonly available: boolean;
  } | null;
}

export type AssignmentRejectionCode =
  | 'TENANT_MISMATCH'
  | 'INCOMPLETE_DATA'
  | 'INVALID_COORDINATES'
  | 'ZONE_NOT_SUPPORTED'
  | 'VEHICLE_UNAVAILABLE'
  | 'WEIGHT_CAPACITY_EXCEEDED'
  | 'VOLUME_CAPACITY_EXCEEDED'
  | 'COURIER_UNAVAILABLE';

export type AssignmentValidationResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly code: AssignmentRejectionCode;
      readonly message: string;
      readonly handler: string;
    };
