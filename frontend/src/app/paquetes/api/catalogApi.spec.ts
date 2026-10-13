import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSectors, fetchShipmentTypes, fetchZones } from './catalogApi';

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

  it('acepta arreglos de catálogo válidos para zonas, sectores y tipos de envío', async () => {
    const shipmentTypes = [
      { id: 'b268c5c7-b2b5-411d-b734-07746ae7e6e6', code: 'STANDARD', name: 'Envío estándar', active: true },
    ];
    const sectors = [
      {
        id: '2ef99933-082e-4d24-b1a1-b5c574ca6aa5',
        zoneId: '08d92a06-4921-4989-92ff-f1917240779c',
        code: 'N-PRADO',
        name: 'El Prado',
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(shipmentTypes), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sectors), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchShipmentTypes()).resolves.toEqual(shipmentTypes);
    await expect(fetchSectors('08d92a06-4921-4989-92ff-f1917240779c')).resolves.toEqual(sectors);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/zones/08d92a06-4921-4989-92ff-f1917240779c/sectors',
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});
