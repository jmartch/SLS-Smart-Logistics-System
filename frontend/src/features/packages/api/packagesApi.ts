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

export function listPackages(): Promise<PackageListItemResponse[]> {
  return apiFetch<PackageListItemResponse[]>('/packages');
}
