import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  GeocodingAttemptPort,
  SavedGeocodingAttempt,
  SaveGeocodingAttemptCommand,
} from '../application/ports/geocoding-attempt.port';

interface InsertedCandidateRow {
  readonly id: string;
}

@Injectable()
export class PrismaGeocodingAttempt implements GeocodingAttemptPort {
  constructor(private readonly prisma: PrismaService) {}

  async saveAtomically(
    command: SaveGeocodingAttemptCommand,
  ): Promise<SavedGeocodingAttempt> {
    return this.prisma.$transaction(async (transaction) => {
      return this.saveInTx(transaction, command);
    });
  }

  async saveInTx(
    transaction: Prisma.TransactionClient,
    command: SaveGeocodingAttemptCommand,
  ): Promise<SavedGeocodingAttempt> {
    await transaction.$executeRaw`
        SELECT set_config('app.tenant_id', ${command.tenantId}, true)
      `;

    const components: Prisma.InputJsonObject = {
      streetType: command.decision.components.streetType,
      streetIdentifier: command.decision.components.streetIdentifier,
      generatingRoad: command.decision.components.generatingRoad,
      plateNumber: command.decision.components.plateNumber,
      neighborhood: command.decision.components.neighborhood,
    };

    const attempt = await transaction.geocodingAttempt.create({
      data: {
        tenantId: command.tenantId,
        addressId: command.addressId,
        datasetId: command.datasetId,
        normalizedText: command.decision.normalizedText,
        components,
        algorithmVersion: command.decision.algorithmVersion,
        status: command.decision.status,
      },
      select: {
        id: true,
      },
    });

    let selectedCandidateId: string | null = null;

    for (const candidate of command.decision.candidates) {
      const scoreBreakdown = JSON.stringify(candidate.scoreBreakdown);

      const statement = Prisma.sql`
                INSERT INTO "GeocodingCandidate" (
                    "tenantId",
                    "attemptId",
                    "datasetId",
                    "addressReferenceId",
                    "rank",
                    "score",
                    "scoreBreakdown",
                    "source",
                    "precision",
                    "location"
                )
                VALUES (
                    ${command.tenantId}::uuid,
                    ${attempt.id}::uuid,
                    ${command.datasetId}::uuid,
                    ${candidate.referenceId}::uuid,
                    ${candidate.rank},
                    ${candidate.score},
                    ${scoreBreakdown}::jsonb,
                    ${'LOCAL_CATALOG'},
                    ${candidate.precision}::"AddressPrecision",
                    ST_SetSRID(
                    ST_MakePoint(${candidate.longitude}, ${candidate.latitude}),
                    4326
                    )
                )
                RETURNING "id"
            `;

      const insertedRows =
        await transaction.$queryRaw<InsertedCandidateRow[]>(statement);

      const insertedCandidate = insertedRows[0];

      if (insertedCandidate === undefined) {
        throw new Error('GEOCODING_CANDIDATE_INSERT_FAILED');
      }

      if (
        command.decision.selectedReferenceId !== null &&
        candidate.referenceId === command.decision.selectedReferenceId
      ) {
        selectedCandidateId = insertedCandidate.id;
      }
    }

    if (command.decision.selectedReferenceId !== null) {
      if (selectedCandidateId === null) {
        throw new Error('SELECTED_GEOCODING_CANDIDATE_NOT_PERSISTED');
      }

      const update = await transaction.geocodingAttempt.updateMany({
        where: {
          tenantId: command.tenantId,
          id: attempt.id,
        },
        data: {
          selectedCandidateId,
        },
      });

      if (update.count !== 1) {
        throw new Error('GEOCODING_ATTEMPT_SELECTION_FAILED');
      }
    }

    return {
      attemptId: attempt.id,
    };
  }
}
