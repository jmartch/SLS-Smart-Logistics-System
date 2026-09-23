import { apiFetch } from '../../../shared/api/httpClient';
import type { CatalogOption, SectorOption } from '../types';

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA !== 'false';
const MOCK_ZONES: CatalogOption[] = [
  { id: 'zone-norte', code: 'NORTE', name: 'Zona norte' },
  { id: 'zone-centro', code: 'CENTRO', name: 'Zona centro' },
  { id: 'zone-sur', code: 'SUR', name: 'Zona sur' },
];
const MOCK_SHIPMENT_TYPES: CatalogOption[] = [
  { id: 'standard', code: 'STANDARD', name: 'Envío estándar' },
  { id: 'express', code: 'EXPRESS', name: 'Envío express' },
  { id: 'fragile', code: 'FRAGILE', name: 'Mercancía frágil' },
];
const MOCK_SECTORS: SectorOption[] = [
  { id: 'north-a', zoneId: 'zone-norte', code: 'N-A', name: 'Sector A' },
  { id: 'north-b', zoneId: 'zone-norte', code: 'N-B', name: 'Sector B' },
  { id: 'center-a', zoneId: 'zone-centro', code: 'C-A', name: 'Sector A' },
  { id: 'south-a', zoneId: 'zone-sur', code: 'S-A', name: 'Sector A' },
];

// Contrato asumido, pendiente de confirmar con backend (ZONE-01 / catálogo de
// tipos de envío todavía no están implementados según AGENTS.md §26).
export function fetchZones(): Promise<CatalogOption[]> {
  if (USE_MOCK_DATA) return Promise.resolve(MOCK_ZONES);
  return apiFetch<CatalogOption[]>('/zones');
}

export function fetchSectors(zoneId: string): Promise<SectorOption[]> {
  if (USE_MOCK_DATA) return Promise.resolve(MOCK_SECTORS.filter((sector) => sector.zoneId === zoneId));
  return apiFetch<SectorOption[]>(`/zones/${zoneId}/sectors`);
}

export function fetchShipmentTypes(): Promise<CatalogOption[]> {
  if (USE_MOCK_DATA) return Promise.resolve(MOCK_SHIPMENT_TYPES);
  return apiFetch<CatalogOption[]>('/shipment-types');
}
