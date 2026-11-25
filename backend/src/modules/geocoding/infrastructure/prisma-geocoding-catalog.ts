import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  FindGeocodingCandidatesQuery,
  GeocodingCatalogPort,
  ReadyGeocodingCatalog,
} from '../application/ports/geocoding-catalog.port';
import {
  AddressPrecision,
  GeocodingReference,
} from '../domain/geocoding.types';

interface GeocodingReferenceRow {
  readonly referenceId: string;
  readonly datasetId: string;
  readonly municipalityCode: string;
  readonly normalizedAddress: string;
  readonly streetType: string;
  readonly streetIdentifier: string;
  readonly generatingRoad: string | null;
  readonly plateNumber: string | null;
  readonly neighborhood: string | null;
  readonly precision: AddressPrecision;
  readonly latitude: number;
  readonly longitude: number;
}

@Injectable()
export class PrismaGeocodingCatalog implements GeocodingCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidates(
    query: FindGeocodingCandidatesQuery,
  ): Promise<ReadyGeocodingCatalog | null> {
    return this.prisma.$transaction(
      async (transaction) => {
        return this.findCandidatesInTx(transaction, query);
      },
      {
        isolationLevel: 'RepeatableRead',
      },
    );
  }

  async findCandidatesInTx(
    client: Prisma.TransactionClient | PrismaService,
    query: FindGeocodingCandidatesQuery,
  ): Promise<ReadyGeocodingCatalog | null> {
    const dataset = await client.geoDataset.findFirst({
      where: {
        id: query.datasetId,
        status: 'READY',
      },
      select: {
        id: true,
      },
    });

    if (dataset === null) {
      return null;
    }

    const statement = Prisma.sql`
            SELECT
                reference."id" AS "referenceId",
                reference."datasetId" AS "datasetId",
                reference."municipalityCode" AS "municipalityCode",
                reference."normalizedAddress" AS "normalizedAddress",
                reference."streetType" AS "streetType",
                reference."streetIdentifier" AS "streetIdentifier",
                reference."generatingRoad" AS "generatingRoad",
                reference."plateNumber" AS "plateNumber",
                reference."neighborhood" AS "neighborhood",
                reference."precision" AS "precision",
                ST_Y(reference."location")::float8 AS "latitude",
                ST_X(reference."location")::float8 AS "longitude"
            FROM "AddressReference" AS reference
            WHERE reference."datasetId" = ${query.datasetId}::uuid
                AND reference."municipalityCode" = ${query.municipalityCode}
                AND (
                reference."searchKey" = ${query.searchKeyPrefix}
                OR reference."searchKey" LIKE ${`${query.searchKeyPrefix}|%`}
                )
            ORDER BY reference."id" ASC
            LIMIT ${query.limit}
        `;

    const rows = await client.$queryRaw<GeocodingReferenceRow[]>(statement);

    const references: GeocodingReference[] = rows.map((row) => ({
      referenceId: row.referenceId,
      datasetId: row.datasetId,
      municipalityCode: row.municipalityCode,
      normalizedAddress: row.normalizedAddress,
      components: {
        streetType: row.streetType,
        streetIdentifier: row.streetIdentifier,
        generatingRoad: row.generatingRoad,
        plateNumber: row.plateNumber,
        neighborhood: row.neighborhood,
      },
      precision: row.precision,
      latitude: row.latitude,
      longitude: row.longitude,
    }));

    return {
      datasetId: dataset.id,
      references,
    };
  }
}
