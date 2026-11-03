import { createHash } from 'node:crypto';
import { AddressNormalizer } from '../src/modules/geocoding/domain/address-normalizer';
import { Coordinates } from '../src/modules/route-planning/domain/coordinates';
import { DijkstraShortestPath } from '../src/modules/route-planning/domain/dijkstra-shortest-path';
import { DeterministicGeocoder } from '../src/modules/geocoding/domain/deterministic-geocoder';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

export interface OsmDemoExtract {
  sourceUrl: string;
  fetchedAt: string;
  license: string;
  bounds: number[];
  elements: OsmElement[];
}

export function stableOsmId(key: string): string {
  const hex = createHash('sha256').update(key).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const DRIVABLE = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
]);

export function buildOsmDemoRows(extract: OsmDemoExtract, datasetId: string) {
  if (!Array.isArray(extract.elements) || extract.elements.length === 0) {
    throw new Error('OSM extract contains no elements');
  }
  const elements = new Map(
    extract.elements.map((e) => [`${e.type}/${e.id}`, e]),
  );
  const nodes = new Map<
    number,
    { id: string; osmNodeId: number; lat: number; lon: number }
  >();
  const points = new Map<number, Coordinates>();
  for (const element of elements.values()) {
    if (
      element.type === 'node' &&
      typeof element.lat === 'number' &&
      typeof element.lon === 'number'
    ) {
      points.set(element.id, Coordinates.create(element.lat, element.lon));
    }
  }
  const edges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    osmWayId: number;
    distanceM: number;
    durationS: number;
    roadClass: string;
    points: number[][];
    tags: Record<string, string>;
  }> = [];
  let skippedWays = 0;
  for (const way of elements.values()) {
    const tags = way.tags ?? {};
    if (way.type !== 'way' || !tags.highway) continue;
    const access =
      tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access;
    if (
      !DRIVABLE.has(tags.highway) ||
      ['no', 'private', 'destination', 'delivery'].includes(access) ||
      Object.keys(tags).some((k) => k.endsWith(':conditional')) ||
      !way.nodes ||
      way.nodes.some((id) => !points.has(id)) ||
      (tags.oneway &&
        !['yes', '1', 'true', '-1', 'no', '0', 'false'].includes(tags.oneway))
    ) {
      skippedWays++;
      continue;
    }
    const forwardOnly =
      ['yes', '1', 'true'].includes(tags.oneway) ||
      (!tags.oneway &&
        (tags.junction === 'roundabout' || tags.highway === 'motorway'));
    const reverseOnly = tags.oneway === '-1';
    const numericSpeed = Number(tags.maxspeed);
    const speedKmh =
      Number.isFinite(numericSpeed) && numericSpeed > 0
        ? Math.min(numericSpeed, 130)
        : 30;
    for (let i = 1; i < way.nodes.length; i++) {
      const from = way.nodes[i - 1];
      const to = way.nodes[i];
      const a = points.get(from)!;
      const b = points.get(to)!;
      const distanceM = a.distanceTo(b);
      if (from === to || distanceM < 0.001) continue;
      for (const id of [from, to]) {
        const point = points.get(id)!;
        nodes.set(id, {
          id: stableOsmId(`${datasetId}/node/${id}`),
          osmNodeId: id,
          lat: point.latitude,
          lon: point.longitude,
        });
      }
      const directions = reverseOnly
        ? [[to, from]]
        : forwardOnly
          ? [[from, to]]
          : [
              [from, to],
              [to, from],
            ];
      for (const [start, end] of directions) {
        const p = points.get(start)!;
        const q = points.get(end)!;
        edges.push({
          id: stableOsmId(`${datasetId}/way/${way.id}/${i}/${start}/${end}`),
          fromNodeId: nodes.get(start)!.id,
          toNodeId: nodes.get(end)!.id,
          osmWayId: way.id,
          distanceM,
          durationS: distanceM / (speedKmh / 3.6),
          roadClass: tags.highway,
          points: [
            [p.longitude, p.latitude],
            [q.longitude, q.latitude],
          ],
          tags,
        });
      }
    }
  }
  const normalizer = new AddressNormalizer();
  const references = [] as Array<{
    id: string;
    sourceRecordId: string;
    normalizedAddress: string;
    searchKey: string;
    streetType: string;
    streetIdentifier: string;
    generatingRoad: string;
    plateNumber: string;
    lat: number;
    lon: number;
    tags: Record<string, string>;
  }>;
  const seenAddresses = new Set<string>();
  let skippedAddresses = 0;
  for (const element of elements.values()) {
    const tags = element.tags ?? {};
    if (!tags['addr:street'] || !tags['addr:housenumber']) continue;
    const location =
      element.type === 'node' ? points.get(element.id) : undefined;
    // Limit the demo to OSM address points. Polygon centroids do not establish an entrance.
    if (!location) {
      skippedAddresses++;
      continue;
    }
    try {
      const normalized = normalizer.normalize(
        `${tags['addr:street']} # ${tags['addr:housenumber'].replace(/^#\s*/, '')}`,
      );
      if (seenAddresses.has(normalized.normalizedText)) continue;
      seenAddresses.add(normalized.normalizedText);
      const c = normalized.components;
      references.push({
        id: stableOsmId(`${datasetId}/address/${element.type}/${element.id}`),
        sourceRecordId: `${element.type}/${element.id}`,
        normalizedAddress: normalized.normalizedText,
        searchKey: [
          c.streetType,
          c.streetIdentifier,
          c.generatingRoad,
          c.plateNumber,
        ].join('|'),
        streetType: c.streetType!,
        streetIdentifier: c.streetIdentifier!,
        generatingRoad: c.generatingRoad!,
        plateNumber: c.plateNumber!,
        lat: location.latitude,
        lon: location.longitude,
        tags,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'InvalidAddressError')
        skippedAddresses++;
      else throw error;
    }
  }
  return {
    nodes: [...nodes.values()],
    edges,
    references,
    skippedWays,
    skippedAddresses,
  };
}

export function verifyOsmDemoRows(
  rows: ReturnType<typeof buildOsmDemoRows>,
  datasetId: string,
) {
  const graph = {
    nodes: rows.nodes.map((n) => ({ id: n.id })),
    edges: rows.edges.map((e) => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      cost: e.distanceM,
    })),
  };
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const edge of rows.edges) {
    forward.set(edge.fromNodeId, [
      ...(forward.get(edge.fromNodeId) ?? []),
      edge.toNodeId,
    ]);
    reverse.set(edge.toNodeId, [
      ...(reverse.get(edge.toNodeId) ?? []),
      edge.fromNodeId,
    ]);
  }
  function reachable(start: string, adjacency: Map<string, string[]>) {
    const seen = new Set([start]);
    const pending = [start];
    while (pending.length)
      for (const id of adjacency.get(pending.pop()!) ?? []) {
        if (!seen.has(id)) {
          seen.add(id);
          pending.push(id);
        }
      }
    return seen;
  }
  function nearest(lat: number, lon: number) {
    const point = Coordinates.create(lat, lon);
    return rows.nodes
      .map((n) => ({
        ...n,
        accessM: point.distanceTo(Coordinates.create(n.lat, n.lon)),
      }))
      .sort((a, b) => a.accessM - b.accessM || a.id.localeCompare(b.id))[0];
  }
  const center = Coordinates.create(11.003, -74.805);
  const anchors = [...rows.nodes].sort(
    (a, b) =>
      center.distanceTo(Coordinates.create(a.lat, a.lon)) -
      center.distanceTo(Coordinates.create(b.lat, b.lon)),
  );
  const geocoder = new DeterministicGeocoder();
  for (const depot of anchors.slice(0, 30)) {
    const outgoing = reachable(depot.id, forward);
    const incoming = reachable(depot.id, reverse);
    const examples = [] as Array<{
      address: string;
      referenceId: string;
      nodeId: string;
      lat: number;
      lon: number;
      accessM: number;
      outboundM: number;
      returnM: number;
    }>;
    for (const reference of rows.references) {
      const node = nearest(reference.lat, reference.lon);
      if (
        !node ||
        node.accessM > 100 ||
        !outgoing.has(node.id) ||
        !incoming.has(node.id) ||
        examples.some((e) => e.nodeId === node.id)
      )
        continue;
      const references = rows.references
        .filter(
          (r) =>
            r.streetType === reference.streetType &&
            r.streetIdentifier === reference.streetIdentifier,
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 20)
        .map((r) => ({
          referenceId: r.id,
          datasetId,
          municipalityCode: '08001',
          normalizedAddress: r.normalizedAddress,
          components: {
            streetType: r.streetType,
            streetIdentifier: r.streetIdentifier,
            generatingRoad: r.generatingRoad,
            plateNumber: r.plateNumber,
            neighborhood: null,
          },
          precision: 'BUILDING' as const,
          latitude: r.lat,
          longitude: r.lon,
        }));
      const decision = geocoder.decide({
        originalText: reference.normalizedAddress,
        municipalityCode: '08001',
        datasetId,
        references,
      });
      if (decision.status !== 'MATCHED') continue;
      const outbound = new DijkstraShortestPath().find(
        graph,
        depot.id,
        node.id,
      );
      const back = new DijkstraShortestPath().find(graph, node.id, depot.id);
      if (!outbound || !back) continue;
      examples.push({
        address: reference.normalizedAddress,
        referenceId: reference.id,
        nodeId: node.id,
        lat: reference.lat,
        lon: reference.lon,
        accessM: node.accessM,
        outboundM: outbound.totalCost,
        returnM: back.totalCost,
      });
      if (examples.length === 3) return { depot, examples };
    }
  }
  throw new Error(
    'OSM demo has fewer than three geocodable address points with round-trip road connectivity',
  );
}
