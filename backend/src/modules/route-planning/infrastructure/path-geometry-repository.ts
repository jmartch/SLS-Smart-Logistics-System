import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { GraphEdgeId } from '../domain/directed-graph';
import {
  LongitudeLatitude,
  RoadEdgeGeometry,
  RoadPathGeometryRepository,
} from '../domain/road-path-geometry-repository';

@Injectable()
export class PrismaRoadPathGeometryRepository implements RoadPathGeometryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadOrderedGeometries(
    datasetId: string,
    edgeIds: readonly GraphEdgeId[],
  ): Promise<readonly RoadEdgeGeometry[]> {
    if (edgeIds.length === 0) {
      return [];
    }

    const uniqueEdgeIds = [...new Set(edgeIds)];
    const rows = await this.loadEdgeGeoJson(datasetId, uniqueEdgeIds);
    const geometries = new Map(
      rows.map((row) => [row.edgeId, parseLineString(row.geojson)]),
    );

    return edgeIds.map((edgeId) => {
      const coordinates = geometries.get(edgeId);
      if (coordinates === undefined) {
        throw new Error(`ROAD_EDGE_GEOMETRY_NOT_FOUND: ${edgeId}`);
      }
      return { edgeId, coordinates };
    });
  }

  private loadEdgeGeoJson(datasetId: string, edgeIds: readonly GraphEdgeId[]) {
    return this.prisma.$queryRaw<EdgeGeoJsonRow[]>`
      SELECT edge."id" AS "edgeId",
        CASE
          WHEN ST_DWithin(
            ST_StartPoint(edge."geometry")::geography,
            source."location"::geography,
            1
          ) AND ST_DWithin(
            ST_EndPoint(edge."geometry")::geography,
            destination."location"::geography,
            1
          ) THEN ST_AsGeoJSON(edge."geometry")
          WHEN ST_DWithin(
            ST_EndPoint(edge."geometry")::geography,
            source."location"::geography,
            1
          ) AND ST_DWithin(
            ST_StartPoint(edge."geometry")::geography,
            destination."location"::geography,
            1
          ) THEN ST_AsGeoJSON(ST_Reverse(edge."geometry"))
          ELSE NULL
        END AS "geojson"
      FROM "RoadEdge" AS edge
      JOIN "GeoDataset" AS dataset
        ON dataset."id" = edge."datasetId"
        AND dataset."status" = 'READY'
      JOIN "RoadNode" AS source
        ON source."datasetId" = edge."datasetId"
        AND source."id" = edge."fromNodeId"
      JOIN "RoadNode" AS destination
        ON destination."datasetId" = edge."datasetId"
        AND destination."id" = edge."toNodeId"
      WHERE edge."datasetId" = ${datasetId}::uuid
        AND edge."id" IN (${Prisma.join(
          edgeIds.map((edgeId) => Prisma.sql`${edgeId}::uuid`),
        )})
    `;
  }
}

interface EdgeGeoJsonRow {
  readonly edgeId: string;
  readonly geojson: string | null;
}

function parseLineString(geojson: string | null): readonly LongitudeLatitude[] {
  if (geojson === null) {
    throw new Error('ROAD_EDGE_GEOMETRY_DIRECTION_MISMATCH');
  }

  let value: unknown;
  try {
    value = JSON.parse(geojson);
  } catch {
    throw new Error('INVALID_ROAD_EDGE_GEOJSON');
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== 'LineString' ||
    !('coordinates' in value) ||
    !Array.isArray(value.coordinates) ||
    value.coordinates.length < 2
  ) {
    throw new Error('INVALID_ROAD_EDGE_GEOJSON');
  }

  return value.coordinates.map((point: unknown): LongitudeLatitude => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error('INVALID_ROAD_EDGE_GEOJSON');
    }

    const longitude: unknown = point[0];
    const latitude: unknown = point[1];
    if (
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error('INVALID_ROAD_EDGE_GEOJSON');
    }

    return [longitude, latitude];
  });
}
