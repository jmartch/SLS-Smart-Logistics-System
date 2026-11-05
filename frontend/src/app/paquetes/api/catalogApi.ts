import { apiFetch } from '../../../shared/api/httpClient';
import type { CatalogOption, SectorOption, ShipmentTypeOption } from '../types';

export function fetchZones(): Promise<CatalogOption[]> {
  return fetchCatalog<CatalogOption>('/zones');
}

export function fetchSectors(zoneId: string): Promise<SectorOption[]> {
  return fetchCatalog<SectorOption>(`/zones/${encodeURIComponent(zoneId)}/sectors`);
}

export function fetchShipmentTypes(): Promise<ShipmentTypeOption[]> {
  return fetchCatalog<ShipmentTypeOption>('/shipment-types');
}

async function fetchCatalog<T extends CatalogOption>(path: string): Promise<T[]> {
  const result = await apiFetch<unknown>(path);

  if (
    !Array.isArray(result) ||
    !result.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).id === 'string' &&
        typeof (item as Record<string, unknown>).code === 'string' &&
        typeof (item as Record<string, unknown>).name === 'string',
    )
  ) {
    throw new Error(`La respuesta de ${path} no es un catálogo válido.`);
  }

  return result as T[];
}
