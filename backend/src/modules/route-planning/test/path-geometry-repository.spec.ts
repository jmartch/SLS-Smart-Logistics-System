import { PrismaService } from '../../../database/prisma.service';
import { PrismaRoadPathGeometryRepository } from '../infrastructure/path-geometry-repository';

describe('PrismaRoadPathGeometryRepository', () => {
  const datasetId = '30000000-0000-0000-0000-000000000001';
  const firstEdgeId = '50000000-0000-0000-0000-000000000001';
  const secondEdgeId = '50000000-0000-0000-0000-000000000002';

  function createFixture() {
    const queryRaw = jest.fn();
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    return {
      queryRaw,
      repository: new PrismaRoadPathGeometryRepository(prisma),
    };
  }

  it('returns an empty path without querying PostgreSQL', async () => {
    const { queryRaw, repository } = createFixture();

    await expect(
      repository.loadOrderedGeometries(datasetId, []),
    ).resolves.toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('keeps path order even when database rows arrive in another order', async () => {
    const { queryRaw, repository } = createFixture();
    queryRaw.mockResolvedValue([
      {
        edgeId: secondEdgeId,
        geojson: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [-74.79, 10.99],
            [-74.78, 11],
          ],
        }),
      },
      {
        edgeId: firstEdgeId,
        geojson: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [-74.8, 10.98],
            [-74.79, 10.99],
          ],
        }),
      },
    ]);

    await expect(
      repository.loadOrderedGeometries(datasetId, [firstEdgeId, secondEdgeId]),
    ).resolves.toEqual([
      {
        edgeId: firstEdgeId,
        coordinates: [
          [-74.8, 10.98],
          [-74.79, 10.99],
        ],
      },
      {
        edgeId: secondEdgeId,
        coordinates: [
          [-74.79, 10.99],
          [-74.78, 11],
        ],
      },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('preserves a repeated edge in the requested path', async () => {
    const { queryRaw, repository } = createFixture();
    queryRaw.mockResolvedValue([
      {
        edgeId: firstEdgeId,
        geojson: '{"type":"LineString","coordinates":[[0,0],[1,1]]}',
      },
    ]);

    const result = await repository.loadOrderedGeometries(datasetId, [
      firstEdgeId,
      firstEdgeId,
    ]);

    expect(result.map((edge) => edge.edgeId)).toEqual([
      firstEdgeId,
      firstEdgeId,
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing edge instead of returning a partial path', async () => {
    const { queryRaw, repository } = createFixture();
    queryRaw.mockResolvedValue([
      {
        edgeId: firstEdgeId,
        geojson: '{"type":"LineString","coordinates":[[0,0],[1,1]]}',
      },
    ]);

    await expect(
      repository.loadOrderedGeometries(datasetId, [firstEdgeId, secondEdgeId]),
    ).rejects.toThrow(`ROAD_EDGE_GEOMETRY_NOT_FOUND: ${secondEdgeId}`);
  });

  it('rejects geometry that cannot be aligned with its directed edge', async () => {
    const { queryRaw, repository } = createFixture();
    queryRaw.mockResolvedValue([{ edgeId: firstEdgeId, geojson: null }]);

    await expect(
      repository.loadOrderedGeometries(datasetId, [firstEdgeId]),
    ).rejects.toThrow('ROAD_EDGE_GEOMETRY_DIRECTION_MISMATCH');
  });

  it.each([
    '{',
    '{"type":"Point","coordinates":[0,0]}',
    '{"type":"LineString","coordinates":[[0,0]]}',
    '{"type":"LineString","coordinates":[[181,0],[1,1]]}',
    '{"type":"LineString","coordinates":[[0,"bad"],[1,1]]}',
  ])('rejects invalid GeoJSON: %s', async (geojson) => {
    const { queryRaw, repository } = createFixture();
    queryRaw.mockResolvedValue([{ edgeId: firstEdgeId, geojson }]);

    await expect(
      repository.loadOrderedGeometries(datasetId, [firstEdgeId]),
    ).rejects.toThrow('INVALID_ROAD_EDGE_GEOJSON');
  });
});
