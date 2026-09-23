import { apiFetch } from '../../../shared/api/httpClient';
import type { RegisterPackagePayload, RegisterPackageResult } from '../types';

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA !== 'false';

export function registerPackage(payload: RegisterPackagePayload): Promise<RegisterPackageResult> {
  if (USE_MOCK_DATA) {
    return Promise.resolve({ id: `mock-${Date.now()}`, trackingCode: payload.trackingCode, state: 'RECEIVED' });
  }
  return apiFetch<RegisterPackageResult>('/packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
