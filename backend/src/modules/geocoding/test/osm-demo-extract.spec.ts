import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  buildOsmDemoRows,
  verifyOsmDemoRows,
  type OsmDemoExtract,
} from '../../../../prisma/osm-demo-extract';

const DATASET = '10000000-0000-4000-8000-000000000001';

function createExtract(tags: Record<string, string> = {}): OsmDemoExtract {
  return {
    sourceUrl: 'https://api.openstreetmap.org/api/0.6/map.json',
    fetchedAt: '2026-10-13T00:00:00Z',
    license: 'ODbL-1.0',
    bounds: [],
    elements: [
      { type: 'node', id: 1, lat: 11, lon: -74.8 },
      { type: 'node', id: 2, lat: 11.001, lon: -74.8 },
      {
        type: 'way',
        id: 10,
        nodes: [1, 2],
        tags: { highway: 'residential', ...tags },
      },
      {
        type: 'node',
        id: 3,
        lat: 11.0002,
        lon: -74.8001,
        tags: { 'addr:street': 'Carrera 52', 'addr:housenumber': '80-96' },
      },
    ],
  };
}

describe('buildOsmDemoRows', () => {
  describe('bundled OpenStreetMap extract', () => {
    it('provides three geocodable public addresses connected by round-trip Dijkstra paths', () => {
      const extract = JSON.parse(
        gunzipSync(
          readFileSync('prisma/data/barranquilla-demo.osm.json.gz'),
        ).toString('utf8'),
      ) as OsmDemoExtract;
      const rows = buildOsmDemoRows(extract, DATASET);

      const verified = verifyOsmDemoRows(rows, DATASET);

      expect(verified.examples).toHaveLength(3);
      for (const example of verified.examples) {
        expect(example.accessM).toBeLessThanOrEqual(100);
        expect(example.outboundM).toBeGreaterThan(0);
        expect(example.returnM).toBeGreaterThan(0);
      }
    });
  });
  describe('road import', () => {
    it.each([
      [{}, 2],
      [{ oneway: 'yes' }, 1],
      [{ oneway: '-1' }, 1],
      [{ access: 'private' }, 0],
      [{ motor_vehicle: 'no' }, 0],
      [{ 'access:conditional': 'no @ (night)' }, 0],
      [{ highway: 'footway' }, 0],
    ] as const)(
      'imports only supported motor-vehicle directions for %j',
      (tags, expectedEdges) => {
        const extract = createExtract(tags);

        const result = buildOsmDemoRows(extract, DATASET);

        expect(result.edges).toHaveLength(expectedEdges);
        for (const edge of result.edges) {
          expect(edge.distanceM).toBeGreaterThan(100);
          expect(edge.durationS).toBeGreaterThan(0);
        }
        if ('oneway' in tags && tags.oneway === '-1')
          expect(result.edges[0].points[0]).toEqual([-74.8, 11.001]);
      },
    );

    it('skips an incomplete way rather than connecting across missing nodes', () => {
      const extract = createExtract();
      extract.elements[2].nodes = [1, 999, 2];

      const result = buildOsmDemoRows(extract, DATASET);

      expect(result.edges).toEqual([]);
    });
  });

  describe('address import', () => {
    it('preserves real source coordinates and normalizes supported address tags', () => {
      const extract = createExtract();

      const result = buildOsmDemoRows(extract, DATASET);

      expect(result.references[0]).toMatchObject({
        normalizedAddress: 'CARRERA 52 # 80-96',
        searchKey: 'CARRERA|52|80|96',
        sourceRecordId: 'node/3',
        lat: 11.0002,
        lon: -74.8001,
      });
      expect(buildOsmDemoRows(extract, DATASET)).toEqual(result);
    });

    it('skips unsupported addresses without inventing plate numbers or coordinates', () => {
      const extract = createExtract();
      extract.elements[3].tags!['addr:housenumber'] = 'unknown';

      const result = buildOsmDemoRows(extract, DATASET);

      expect(result.references).toEqual([]);
      expect(result.skippedAddresses).toBe(1);
    });
  });
});
