import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchShipmentTypes, fetchZones } from './catalogApi';

vi.mock('../../../shared/config/environment', () => ({
  API_BASE_URL: '/api',
  USE_MOCK_DATA: false,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalogApi', () => {
  it('rechaza una respuesta nula para que no llegue al render del formulario', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(fetchZones()).rejects.toThrow('no es un catálogo válido');
  });

  it('acepta arreglos de catálogo válidos', async () => {
    const catalog = [{ id: 'standard', code: 'STANDARD', name: 'Envío estándar' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(catalog), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(fetchShipmentTypes()).resolves.toEqual(catalog);
  });
});
