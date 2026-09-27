import { apiFetch } from '../../../shared/api/httpClient';
import { USE_MOCK_DATA } from '../../../shared/config/environment';
import type { CatalogOption, SectorOption } from '../types';

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
export async function fetchZones(): Promise<CatalogOption[]> {
  if (USE_MOCK_DATA) return Promise.resolve(MOCK_ZONES);
  return fetchCatalog<CatalogOption>('/zones');
}

export async function fetchSectors(zoneId: string): Promise<SectorOption[]> {
  if (USE_MOCK_DATA) return Promise.resolve(MOCK_SECTORS.filter((sector) => sector.zoneId === zoneId));
  return fetchCatalog<SectorOption>(`/zones/${zoneId}/sectors`);
}

export async function fetchShipmentTypes(): Promise<CatalogOption[]> {
  if (USE_MOCK_DATA) return Promise.resolve(MOCK_SHIPMENT_TYPES);
  return fetchCatalog<CatalogOption>('/shipment-types');
}

async function fetchCatalog<T>(path: string): Promise<T[]> {
  const result = await apiFetch<unknown>(path);

  if (!Array.isArray(result)) {
    throw new Error(`La respuesta de ${path} no es un catálogo válido.`);
  }

  return result as T[];
}
