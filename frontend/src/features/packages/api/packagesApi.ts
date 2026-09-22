import { apiFetch } from '../../../shared/api/httpClient';
import type { RegisterPackagePayload, RegisterPackageResult } from '../types';

export function registerPackage(payload: RegisterPackagePayload): Promise<RegisterPackageResult> {
  return apiFetch<RegisterPackageResult>('/packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
