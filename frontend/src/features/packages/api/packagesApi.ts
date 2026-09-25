import { apiFetch } from '../../../shared/api/httpClient';
import { USE_MOCK_DATA } from '../../../shared/config/environment';
import type { RegisterPackagePayload, RegisterPackageResult } from '../types';

export function registerPackage(payload: RegisterPackagePayload): Promise<RegisterPackageResult> {
  if (USE_MOCK_DATA) {
    return Promise.resolve({ id: `mock-${Date.now()}`, trackingCode: payload.trackingCode, state: 'REGISTERED' });
  }
  return apiFetch<RegisterPackageResult>('/packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
