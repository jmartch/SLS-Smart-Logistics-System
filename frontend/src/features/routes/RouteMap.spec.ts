import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fitBoundsSpy = vi.fn();

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'leaflet-map-container' }, children),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) =>
    createElement('div', {
      'data-testid': 'leaflet-tile-layer',
      'data-url': url,
      'data-attribution': attribution,
    }),
  Polyline: ({ positions }: { positions: [number, number][] }) =>
    createElement('div', {
      'data-testid': 'leaflet-polyline',
      'data-positions': JSON.stringify(positions),
    }),
  CircleMarker: ({
    center,
    children,
  }: {
    center: [number, number];
    children?: ReactNode;
  }) =>
    createElement(
      'div',
      {
        'data-testid': 'leaflet-circle-marker',
        'data-center': JSON.stringify(center),
      },
      children,
    ),
  Tooltip: ({ children }: { children?: ReactNode }) =>
    createElement('span', { 'data-testid': 'leaflet-tooltip' }, children),
  Popup: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'leaflet-popup' }, children),
  useMap: () => ({
    fitBounds: fitBoundsSpy,
  }),
}));

vi.mock('../../shared/config/environment', () => ({
  API_BASE_URL: '/api/v1',
  USE_MOCK_DATA: false,
}));

import {
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  RouteMap,
  computeMapBounds,
  computePolylinePositions,
  isValidCoordinate,
  normalizeOrderedStops,
  type RouteMapStop,
} from './RouteMap';
import {
  fetchRouteDetailFromBackend,
  isUuidRouteId,
  mapBackendStopsToRouteMapStops,
  mapFixtureStopsToRouteMapStops,
} from './routeDetailApi';

afterEach(() => {
  vi.unstubAllGlobals();
  fitBoundsSpy.mockClear();
});

describe('RouteMap & routeDetailApi (Barranquilla OpenStreetMap)', () => {
  const barranquillaStopsUnordered: RouteMapStop[] = [
    {
      id: '31000000-0000-4000-8000-000000000003',
      stopNumber: 3,
      latitude: 11.0112,
      longitude: -74.8265,
      state: 'PENDING',
      label: 'Centro Empresarial Buenavista',
    },
    {
      id: '31000000-0000-4000-8000-000000000001',
      stopNumber: 1,
      latitude: 10.9961,
      longitude: -74.806,
      state: 'COMPLETED',
      label: 'Ferretería del Norte',
    },
    {
      id: '31000000-0000-4000-8000-000000000002',
      stopNumber: 2,
      latitude: 11.0041,
      longitude: -74.8152,
      state: 'PENDING',
      label: 'Clínica Alto Prado',
    },
  ];

  it('usa la URL oficial de tiles y atribución de OpenStreetMap', () => {
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(OSM_ATTRIBUTION).toBe('© OpenStreetMap contributors');
  });

  it('valida coordenadas numéricas dentro de rangos geográficos válidos', () => {
    expect(isValidCoordinate(10.9961, -74.806)).toBe(true);
    expect(isValidCoordinate(NaN, -74.806)).toBe(false);
    expect(isValidCoordinate(95, -74.806)).toBe(false);
    expect(isValidCoordinate(10.9961, -190)).toBe(false);
  });

  it('ordena paradas por stopNumber y descarta coordenadas inválidas', () => {
    const withInvalid: RouteMapStop[] = [
      ...barranquillaStopsUnordered,
      {
        stopNumber: 4,
        latitude: Number.NaN,
        longitude: -74.81,
        state: 'FAILED',
      },
    ];

    const ordered = normalizeOrderedStops(withInvalid);
    expect(ordered.map((s) => s.stopNumber)).toEqual([1, 2, 3]);
    expect(computePolylinePositions(withInvalid)).toEqual([
      [10.9961, -74.806],
      [11.0041, -74.8152],
      [11.0112, -74.8265],
    ]);
  });

  it('calcula límites geográficos (bounds) para múltiples paradas y retorna null sin paradas válidas', () => {
    expect(computeMapBounds([])).toBeNull();
    expect(computeMapBounds(barranquillaStopsUnordered)).toEqual([
      [10.9961, -74.8265],
      [11.0112, -74.806],
    ]);
  });

  it('renderiza el estado vacío cuando no existen coordenadas válidas', () => {
    const html = renderToStaticMarkup(
      createElement(RouteMap, {
        stops: [
          {
            stopNumber: 1,
            latitude: Number.NaN,
            longitude: Number.NaN,
            state: 'PENDING',
          },
        ],
      }),
    );

    expect(html).toContain('data-testid="route-map-empty"');
    expect(html).toContain('Sin coordenadas válidas para mostrar en el mapa');
  });

  it('renderiza tiles de OpenStreetMap, atribución, marcadores numerados y polilínea en orden', () => {
    const html = renderToStaticMarkup(
      createElement(RouteMap, {
        stops: barranquillaStopsUnordered,
        dataSourceLabel: 'Datos reales GET /api/v1/routes/:id',
      }),
    );

    expect(html).toContain('data-testid="route-map"');
    expect(html).toContain(
      'data-url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"',
    );
    expect(html).toContain('© OpenStreetMap contributors');
    expect(html).toContain(
      '[[10.9961,-74.806],[11.0041,-74.8152],[11.0112,-74.8265]]',
    );
    expect(html).toContain('#1');
    expect(html).toContain('#2');
    expect(html).toContain('#3');
    expect(html).toContain('no representa navegación vial exacta');
  });

  it('mapea paradas reales de GET /api/v1/routes/:id y las enriquece con el fixture determinista', () => {
    const mapped = mapBackendStopsToRouteMapStops(
      [
        {
          id: '31000000-0000-4000-8000-000000000002',
          stopNumber: 2,
          latitude: 11.0041,
          longitude: -74.8152,
          state: 'PENDING',
        },
        {
          id: '31000000-0000-4000-8000-000000000001',
          stopNumber: 1,
          latitude: 10.9961,
          longitude: -74.806,
          state: 'COMPLETED',
        },
      ],
      [
        {
          id: '31000000-0000-4000-8000-000000000001',
          order: 1,
          packageId: '90000000-0000-4000-8000-000000000001',
          trackingCode: 'SLS-DEMO-BAQ-0001',
          recipient: 'Ferretería del Norte',
          address: 'Cra 54 # 72-80, El Prado, Barranquilla',
          status: 'delivered',
        },
      ],
    );

    expect(mapped).toHaveLength(2);
    expect(mapped[0]?.stopNumber).toBe(1);
    expect(mapped[0]?.label).toBe('Ferretería del Norte');
    expect(mapped[0]?.trackingCode).toBe('SLS-DEMO-BAQ-0001');
    expect(mapped[1]?.stopNumber).toBe(2);
  });

  it('mapea paradas del fixture local convirtiendo estados al contrato de RouteMap', () => {
    const mapped = mapFixtureStopsToRouteMapStops([
      {
        id: 's1',
        order: 1,
        packageId: 'pkg-001',
        trackingCode: 'SLS-2026-00141',
        recipient: 'Carmen Jiménez',
        address: 'Cra 54 # 72-80, El Prado, Barranquilla',
        status: 'delivered',
        latitude: 10.9961,
        longitude: -74.806,
      },
    ]);

    expect(mapped).toEqual([
      {
        id: 's1',
        stopNumber: 1,
        latitude: 10.9961,
        longitude: -74.806,
        state: 'COMPLETED',
        label: 'Carmen Jiménez',
        address: 'Cra 54 # 72-80, El Prado, Barranquilla',
        trackingCode: 'SLS-2026-00141',
      },
    ]);
  });

  it('consulta GET /api/v1/routes/:id solo para UUID válidos', async () => {
    expect(isUuidRouteId('rt-001')).toBe(false);
    expect(isUuidRouteId('30000000-0000-4000-8000-000000000001')).toBe(true);

    const nonUuidResult = await fetchRouteDetailFromBackend('rt-001');
    expect(nonUuidResult).toBeNull();

    const apiResponse = {
      id: '30000000-0000-4000-8000-000000000001',
      tenantId: '10000000-0000-4000-8000-000000000001',
      state: 'PLANNED',
      vehicleId: '60000000-0000-4000-8000-000000000001',
      courierId: '70000000-0000-4000-8000-000000000001',
      stops: [
        {
          id: '31000000-0000-4000-8000-000000000001',
          stopNumber: 1,
          latitude: 10.9961,
          longitude: -74.806,
          state: 'PENDING',
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(apiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const detail = await fetchRouteDetailFromBackend(
      '30000000-0000-4000-8000-000000000001',
      {
        tenantId: '10000000-0000-4000-8000-000000000001',
        userId: '20000000-0000-4000-8000-000000000001',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(detail?.stops).toHaveLength(1);
    expect(detail?.stops[0]?.latitude).toBe(10.9961);
  });
});
