import { apiFetch } from '../../../shared/api/httpClient';
import type { RegisterPackagePayload, RegisterPackageResult } from '../types';

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
  readonly history: readonly {
    readonly fromState: string | null;
    readonly toState: string;
    readonly reasonCode: string | null;
    readonly changedBy: string | null;
    readonly createdAt: string;
  }[];
}

export function listPackages(): Promise<PackageListItemResponse[]> {
  return apiFetch<PackageListItemResponse[]>('/packages');
}

export function getPackageDetail(packageId: string): Promise<PackageDetailResponse> {
  return apiFetch<PackageDetailResponse>(`/packages/${encodeURIComponent(packageId)}`);
}
