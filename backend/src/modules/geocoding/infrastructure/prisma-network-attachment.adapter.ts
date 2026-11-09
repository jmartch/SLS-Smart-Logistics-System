import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
  FindCandidateRoadNodesQuery,
  NetworkAttachmentPort,
  SavedNetworkAttachmentRecord,
  SaveNetworkAttachmentCommand,
} from '../application/ports/network-attachment.port';
import type {
  RoadNodeCandidate,
  RoadProfile,
} from '../domain/network-attachment.types';

interface CandidateNodeRow {
  readonly id: string;
  readonly datasetId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly profiles: string[];
}

interface SavedAttachmentRow {
  readonly id: string;
  readonly tenantId: string;
  readonly datasetId: string;
  readonly geocodingCandidateId: string;
  readonly profile: RoadProfile;
  readonly roadNodeId: string | null;
  readonly roadEdgeId: string | null;
  readonly status:
    'AUTO_ACCEPTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
  readonly accessDistanceM: string;
}

@Injectable()
export class PrismaNetworkAttachmentAdapter implements NetworkAttachmentPort {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidateNodes(
    query: FindCandidateRoadNodesQuery,
  ): Promise<readonly RoadNodeCandidate[]> {
    return this.findCandidateNodesInTx(this.prisma, query);
  }

  async findCandidateNodesInTx(
    client: Prisma.TransactionClient | PrismaService,
    query: FindCandidateRoadNodesQuery,
  ): Promise<readonly RoadNodeCandidate[]> {
    if (
      query.searchRadiusMeters === undefined ||
      query.searchRadiusMeters === null
    ) {
      throw new Error(
        'searchRadiusMeters is required for candidate road nodes query to respect configuration radius',
      );
    }
    const radiusMeters = query.searchRadiusMeters;
    const limit = query.limit ?? 20;

    const rows = await client.$queryRaw<CandidateNodeRow[]>`
            SELECT
                n.id,
                n."datasetId",
                ST_Y(n.location)::float8 AS latitude,
                ST_X(n.location)::float8 AS longitude,
                ARRAY(
                    SELECT DISTINCT e.profile::text
                    FROM "RoadEdge" e
                    WHERE e."datasetId" = n."datasetId"
                      AND (e."fromNodeId" = n.id OR e."toNodeId" = n.id)
                ) AS profiles
            FROM "RoadNode" n
            JOIN "GeoDataset" d ON d.id = n."datasetId"
            WHERE n."datasetId" = ${query.datasetId}::uuid
              AND d.status = 'READY'
              AND EXISTS (
                  SELECT 1
                  FROM "RoadEdge" re
                  WHERE re."datasetId" = n."datasetId"
                    AND (re."fromNodeId" = n.id OR re."toNodeId" = n.id)
                    AND re.profile = ${query.profile}::"RoadProfile"
              )
              AND ST_DWithin(
                  n.location::geography,
                  ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography,
                  ${radiusMeters}
              )
            ORDER BY
                ST_Distance(
                    n.location::geography,
                    ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography
                ) ASC,
                n.id ASC
            LIMIT ${limit}
        `;

    return rows.map((row) => ({
      nodeId: row.id,
      datasetId: row.datasetId,
      latitude: row.latitude,
      longitude: row.longitude,
      traversableProfiles: (row.profiles ?? []) as RoadProfile[],
    }));
  }

  async saveAttachment(
    command: SaveNetworkAttachmentCommand,
  ): Promise<SavedNetworkAttachmentRecord> {
    return runWithTenant(this.prisma, command.tenantId, (tx) =>
      this.saveAttachmentInTx(tx, command),
    );
  }

  async saveAttachmentInTx(
    client: Prisma.TransactionClient | PrismaService,
    command: SaveNetworkAttachmentCommand,
  ): Promise<SavedNetworkAttachmentRecord> {
    const rows = await client.$queryRaw<SavedAttachmentRow[]>`
            INSERT INTO "NetworkAttachment" (
                "id",
                "tenantId",
                "datasetId",
                "geocodingCandidateId",
                "profile",
                "roadNodeId",
                "roadEdgeId",
                "snappedLocation",
                "accessDistanceM",
                "status",
                "reviewedByUserId",
                "reviewReason",
                "reviewedAt"
            )
            VALUES (
                gen_random_uuid(),
                ${command.tenantId}::uuid,
                ${command.datasetId}::uuid,
                ${command.geocodingCandidateId}::uuid,
                ${command.profile}::"RoadProfile",
                ${command.roadNodeId ? Prisma.sql`${command.roadNodeId}::uuid` : Prisma.sql`NULL`},
                ${command.roadEdgeId ? Prisma.sql`${command.roadEdgeId}::uuid` : Prisma.sql`NULL`},
                ST_SetSRID(ST_MakePoint(${command.snappedLongitude}, ${command.snappedLatitude}), 4326),
                ${command.accessDistanceMeters},
                ${command.status}::"NetworkAttachmentStatus",
                ${command.reviewedByUserId ? Prisma.sql`${command.reviewedByUserId}::uuid` : Prisma.sql`NULL`},
                ${command.reviewReason ? Prisma.sql`${command.reviewReason}` : Prisma.sql`NULL`},
                ${command.reviewedAt ? Prisma.sql`${command.reviewedAt}::timestamptz` : Prisma.sql`NULL`}
            )
            ON CONFLICT ("tenantId", "geocodingCandidateId", "datasetId", "profile")
            DO UPDATE SET
                "status" = EXCLUDED."status",
                "reviewedByUserId" = EXCLUDED."reviewedByUserId",
                "reviewReason" = EXCLUDED."reviewReason",
                "reviewedAt" = EXCLUDED."reviewedAt"
            RETURNING
                id,
                "tenantId",
                "datasetId",
                "geocodingCandidateId",
                profile::text,
                "roadNodeId",
                "roadEdgeId",
                status::text,
                "accessDistanceM"::text
        `;

    const row = rows[0];
    return {
      id: row.id,
      tenantId: row.tenantId,
      datasetId: row.datasetId,
      geocodingCandidateId: row.geocodingCandidateId,
      profile: row.profile,
      roadNodeId: row.roadNodeId,
      roadEdgeId: row.roadEdgeId,
      status: row.status,
      accessDistanceMeters: Number(row.accessDistanceM),
    };
  }

  async findByCandidateAndProfile(query: {
    readonly tenantId: string;
    readonly geocodingCandidateId: string;
    readonly datasetId: string;
    readonly profile: RoadProfile;
  }): Promise<SavedNetworkAttachmentRecord | null> {
    return runWithTenant(this.prisma, query.tenantId, (tx) =>
      this.findByCandidateAndProfileInTx(tx, query),
    );
  }

  async findByCandidateAndProfileInTx(
    client: Prisma.TransactionClient | PrismaService,
    query: {
      readonly tenantId: string;
      readonly geocodingCandidateId: string;
      readonly datasetId: string;
      readonly profile: RoadProfile;
    },
  ): Promise<SavedNetworkAttachmentRecord | null> {
    const rows = await client.$queryRaw<SavedAttachmentRow[]>`
            SELECT
                id,
                "tenantId",
                "datasetId",
                "geocodingCandidateId",
                profile::text,
                "roadNodeId",
                "roadEdgeId",
                status::text,
                "accessDistanceM"::text
            FROM "NetworkAttachment"
            WHERE "tenantId" = ${query.tenantId}::uuid
              AND "geocodingCandidateId" = ${query.geocodingCandidateId}::uuid
              AND "datasetId" = ${query.datasetId}::uuid
              AND profile = ${query.profile}::"RoadProfile"
            LIMIT 1
        `;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      tenantId: row.tenantId,
      datasetId: row.datasetId,
      geocodingCandidateId: row.geocodingCandidateId,
      profile: row.profile,
      roadNodeId: row.roadNodeId,
      roadEdgeId: row.roadEdgeId,
      status: row.status,
      accessDistanceMeters: Number(row.accessDistanceM),
    };
  }
}
