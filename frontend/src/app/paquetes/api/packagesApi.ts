import { apiFetch } from '../../../shared/api/httpClient';
import type {
  CorrectPackageAddressPayload,
  CorrectPackageAddressResult,
  GeocodingCandidateItem,
  PackageGeocodingDiagnostic,
  PackageState,
  RegisterPackagePayload,
  RegisterPackageResult,
  ResolvePackageGeocodingPayload,
  ReviewPackageGeocodingPayload,
} from '../types';

export function registerPackage(payload: RegisterPackagePayload): Promise<RegisterPackageResult> {
  return apiFetch<RegisterPackageResult>('/packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface PackageListItemResponse {
  readonly id: string;
  readonly trackingCode: string;
  readonly state: string;
  readonly priority: string;
  readonly weightKg: string;
  readonly volumeM3: string;
  readonly address: string;
  readonly zone: string | null;
  readonly sector: string | null;
  readonly shipmentType: string;
  readonly registeredAt: string | null;
}

export interface PackageDetailResponse extends PackageListItemResponse {
  readonly lengthCm: string;
  readonly widthCm: string;
  readonly heightCm: string;
  readonly deadline: string | null;
  readonly addressId: string;
  readonly municipalityCode?: string | null;
  readonly geocodingAttemptId?: string | null;
  readonly geocoding?: PackageGeocodingDiagnostic | null;
  readonly candidates?: readonly GeocodingCandidateItem[];
  readonly history: readonly {
    readonly fromState: string | null;
    readonly toState: string;
    readonly reasonCode: string | null;
    readonly changedBy: string | null;
    readonly createdAt: string;
  }[];
}

export interface ClassifyPackagePayload {
  readonly zoneId: string;
  readonly sectorId?: string;
}

export interface ClassifiedPackageResponse {
  readonly id: string;
  readonly tenantId: string;
  readonly trackingCode: string;
  readonly state: PackageState;
  readonly zoneId: string;
  readonly sectorId: string | null;
}

export function listPackages(options?: {
  readonly state?: PackageState;
}): Promise<PackageListItemResponse[]> {
  const query = options?.state
    ? `?state=${encodeURIComponent(options.state)}`
    : '';
  return apiFetch<PackageListItemResponse[]>(`/packages${query}`);
}

export function getPackageDetail(packageId: string): Promise<PackageDetailResponse> {
  return apiFetch<PackageDetailResponse>(`/packages/${encodeURIComponent(packageId)}`);
}

export function classifyPackage(
  packageId: string,
  payload: ClassifyPackagePayload,
): Promise<ClassifiedPackageResponse> {
  return apiFetch<ClassifiedPackageResponse>(
    `/packages/${encodeURIComponent(packageId)}/classify`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function resolvePackageGeocoding(
  packageId: string,
  payload?: ResolvePackageGeocodingPayload,
): Promise<PackageGeocodingDiagnostic> {
  return apiFetch<PackageGeocodingDiagnostic>(
    `/packages/${encodeURIComponent(packageId)}/geocoding/resolve`,
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    },
  );
}

export function reviewPackageGeocoding(
  packageId: string,
  payload: ReviewPackageGeocodingPayload,
): Promise<PackageGeocodingDiagnostic> {
  return apiFetch<PackageGeocodingDiagnostic>(
    `/packages/${encodeURIComponent(packageId)}/geocoding/review`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function correctPackageAddress(
  packageId: string,
  payload: CorrectPackageAddressPayload,
): Promise<CorrectPackageAddressResult> {
  return apiFetch<CorrectPackageAddressResult>(
    `/packages/${encodeURIComponent(packageId)}/address-corrections`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}
