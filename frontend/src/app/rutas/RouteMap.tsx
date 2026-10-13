import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';

export type RouteStopState = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface RouteMapStop {
  readonly id?: string;
  readonly stopNumber: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly state: RouteStopState;
  readonly label?: string;
  readonly address?: string;
  readonly trackingCode?: string;
}

export interface RouteMapProps {
  readonly stops: readonly RouteMapStop[];
  readonly dataSourceLabel?: string;
}

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const BARRANQUILLA_DEFAULT_CENTER: [number, number] = [11.0041, -74.8152];
const SINGLE_POINT_DELTA = 0.004;

export const STOP_STATE_LABEL: Record<RouteStopState, string> = {
  PENDING: 'Pendiente',
  COMPLETED: 'Completada',
  FAILED: 'Fallida',
};

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function normalizeOrderedStops(
  stops: readonly RouteMapStop[],
): RouteMapStop[] {
  if (!Array.isArray(stops)) {
    return [];
  }

  return stops
    .filter(
      (stop) =>
        Boolean(stop) &&
        typeof stop.stopNumber === 'number' &&
        Number.isFinite(stop.stopNumber) &&
        isValidCoordinate(stop.latitude, stop.longitude),
    )
    .slice()
    .sort((a, b) => a.stopNumber - b.stopNumber);
}

export function computePolylinePositions(
  stops: readonly RouteMapStop[],
): [number, number][] {
  return normalizeOrderedStops(stops).map((stop) => [
    stop.latitude,
    stop.longitude,
  ]);
}

export function computeMapBounds(
  stops: readonly RouteMapStop[],
): [[number, number], [number, number]] | null {
  const ordered = normalizeOrderedStops(stops);
  if (ordered.length === 0) {
    return null;
  }

  let minLat = ordered[0]!.latitude;
  let maxLat = ordered[0]!.latitude;
  let minLng = ordered[0]!.longitude;
  let maxLng = ordered[0]!.longitude;

  for (const stop of ordered) {
    if (stop.latitude < minLat) minLat = stop.latitude;
    if (stop.latitude > maxLat) maxLat = stop.latitude;
    if (stop.longitude < minLng) minLng = stop.longitude;
    if (stop.longitude > maxLng) maxLng = stop.longitude;
  }

  if (minLat === maxLat && minLng === maxLng) {
    return [
      [minLat - SINGLE_POINT_DELTA, minLng - SINGLE_POINT_DELTA],
      [maxLat + SINGLE_POINT_DELTA, maxLng + SINGLE_POINT_DELTA],
    ];
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

function getStopMarkerStyle(state: RouteStopState): {
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
} {
  if (state === 'COMPLETED') {
    return {
      color: '#0d6832',
      fillColor: '#16a34a',
      fillOpacity: 0.92,
      weight: 2,
    };
  }
  if (state === 'FAILED') {
    return {
      color: '#991b1b',
      fillColor: '#dc2626',
      fillOpacity: 0.92,
      weight: 2,
    };
  }
  return {
    color: '#072a40',
    fillColor: '#0b608b',
    fillOpacity: 0.92,
    weight: 2,
  };
}

function FitRouteBounds({
  bounds,
}: {
  readonly bounds: [[number, number], [number, number]];
}) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }, [map, bounds]);

  return null;
}

export function RouteMap({ stops, dataSourceLabel }: RouteMapProps) {
  const orderedStops = normalizeOrderedStops(stops);
  const polylinePositions = computePolylinePositions(orderedStops);
  const bounds = computeMapBounds(orderedStops);

  if (orderedStops.length === 0 || !bounds) {
    return (
      <div
        data-testid="route-map-empty"
        style={{
          padding: '1.25rem',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-muted)',
          border: '1px dashed var(--border)',
          textAlign: 'center',
        }}
      >
        <strong
          style={{
            display: 'block',
            color: 'var(--navy)',
            fontSize: '0.84rem',
            marginBottom: '0.35rem',
          }}
        >
          Sin coordenadas válidas para mostrar en el mapa
        </strong>
        <p
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontSize: '0.74rem',
          }}
        >
          Esta ruta no cuenta con paradas georreferenciadas válidas. La lista de
          paradas continúa disponible en este panel.
        </p>
      </div>
    );
  }

  const initialCenter: [number, number] = [
    orderedStops[0]?.latitude ?? BARRANQUILLA_DEFAULT_CENTER[0],
    orderedStops[0]?.longitude ?? BARRANQUILLA_DEFAULT_CENTER[1],
  ];

  return (
    <div data-testid="route-map" style={{ display: 'grid', gap: '0.65rem' }}>
      <div
        style={{
          height: 320,
          width: '100%',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: '#eef4f8',
        }}
      >
        <MapContainer
          center={initialCenter}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <FitRouteBounds bounds={bounds} />

          {polylinePositions.length >= 2 && (
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#0b608b',
                weight: 4,
                opacity: 0.85,
                dashArray: '8 6',
              }}
            />
          )}

          {orderedStops.map((stop) => (
            <CircleMarker
              key={stop.id ?? `stop-${stop.stopNumber}`}
              center={[stop.latitude, stop.longitude]}
              radius={13}
              pathOptions={getStopMarkerStyle(stop.state)}
            >
              <Tooltip permanent direction="center" opacity={1}>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: '0.7rem',
                    color: '#072a40',
                  }}
                >
                  #{stop.stopNumber}
                </span>
              </Tooltip>
              <Popup>
                <div style={{ fontSize: '0.76rem', lineHeight: 1.4 }}>
                  <strong>
                    Parada #{stop.stopNumber} · {STOP_STATE_LABEL[stop.state]}
                  </strong>
                  {stop.label && <div>{stop.label}</div>}
                  {stop.address && <div>{stop.address}</div>}
                  {stop.trackingCode && (
                    <div style={{ color: '#475569' }}>
                      Guía: {stop.trackingCode}
                    </div>
                  )}
                  <div style={{ color: '#64748b', marginTop: '0.2rem' }}>
                    {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
        }}
      >
        <span>
          La línea conecta el orden de paradas calculado por el backend; no
          representa navegación vial exacta ni seguimiento GPS en tiempo real.
          {dataSourceLabel ? ` (${dataSourceLabel})` : ''}
        </span>
        <span style={{ fontWeight: 600 }}>{OSM_ATTRIBUTION}</span>
      </div>
    </div>
  );
}
