import { apiFetch } from '../../../shared/api/httpClient';
import type { CatalogOption, SectorOption } from '../types';

// Contrato asumido, pendiente de confirmar con backend (ZONE-01 / catálogo de
// tipos de envío todavía no están implementados según AGENTS.md §26).
export function fetchZones(): Promise<CatalogOption[]> {
  return apiFetch<CatalogOption[]>('/zones');
}

export function fetchSectors(zoneId: string): Promise<SectorOption[]> {
  return apiFetch<SectorOption[]>(`/zones/${zoneId}/sectors`);
}

export function fetchShipmentTypes(): Promise<CatalogOption[]> {
  return apiFetch<CatalogOption[]>('/shipment-types');
}
