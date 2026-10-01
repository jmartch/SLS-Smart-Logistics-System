import { PrismaService } from '../../../database/prisma.service';
import type { SaveGeocodingAttemptCommand } from '../application/ports/geocoding-attempt.port';
import { PrismaGeocodingAttempt } from '../infrastructure/prisma-geocoding-attempt';

describe('PrismaGeocodingAttempt', () => {
    const tenantId = '10000000-0000-0000-0000-000000000001';
    const addressId = '20000000-0000-0000-0000-000000000001';
    const datasetId = '30000000-0000-0000-0000-000000000001';
    const referenceId = '40000000-0000-0000-0000-000000000001';
    const attemptId = '50000000-0000-0000-0000-000000000001';
    const candidateId = '60000000-0000-0000-0000-000000000001';

    const components = {
        streetType: 'CALLE',
        streetIdentifier: '80',
        generatingRoad: '53',
        plateNumber: '67',
        neighborhood: null,
    };

    function createFixture() {
        const executeRaw = jest.fn().mockResolvedValue(1);
        const queryRaw = jest.fn();
        const createAttempt = jest.fn();
        const updateAttempt = jest.fn();

        const transaction = {
            $executeRaw: executeRaw,
            $queryRaw: queryRaw,
            geocodingAttempt: {
                create: createAttempt,
                updateMany: updateAttempt,
            },
        };

        const prisma = {
            $transaction: jest.fn(
                async (callback: (tx: typeof transaction) => Promise<unknown>) =>
                    callback(transaction),
            ),
        } as unknown as PrismaService;

        return {
            executeRaw,
            queryRaw,
            createAttempt,
            updateAttempt,
            repository: new PrismaGeocodingAttempt(prisma),
        };
    }

    function notFoundCommand(): SaveGeocodingAttemptCommand {
        return {
            tenantId,
            addressId,
            datasetId,
            decision: {
                normalizedText: 'CALLE 80 # 53-67',
                components,
                algorithmVersion: 'geocode-v1',
                status: 'NOT_FOUND',
                candidates: [],
                selectedReferenceId: null,
            },
        };
    }

    function matchedCommand(): SaveGeocodingAttemptCommand {
        return {
            tenantId,
            addressId,
            datasetId,
            decision: {
                normalizedText: 'CALLE 80 # 53-67',
                components,
                algorithmVersion: 'geocode-v1',
                status: 'MATCHED',
                selectedReferenceId: referenceId,
                candidates: [
                    {
                        referenceId,
                        rank: 1,
                        score: 1,
                        scoreBreakdown: {
                            streetType: 0.1,
                            streetIdentifier: 0.3,
                            generatingRoad: 0.25,
                            plateNumber: 0.3,
                            neighborhood: 0.05,
                        },
                        precision: 'ENTRANCE',
                        latitude: 11.0132,
                        longitude: -74.8271,
                    },
                ],
            },
        };
    }

    it('persists NOT_FOUND without candidates or selection', async () => {
        const fixture = createFixture();

        fixture.createAttempt.mockResolvedValue({ id: attemptId });

        await expect(
            fixture.repository.saveAtomically(notFoundCommand()),
        ).resolves.toEqual({ attemptId });

        expect(fixture.executeRaw).toHaveBeenCalledTimes(1);

        expect(fixture.createAttempt).toHaveBeenCalledWith({
            data: {
                tenantId,
                addressId,
                datasetId,
                normalizedText: 'CALLE 80 # 53-67',
                components,
                algorithmVersion: 'geocode-v1',
                status: 'NOT_FOUND',
            },
            select: {
                id: true,
            },
        });

        expect(fixture.queryRaw).not.toHaveBeenCalled();
        expect(fixture.updateAttempt).not.toHaveBeenCalled();

        expect(fixture.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
            fixture.createAttempt.mock.invocationCallOrder[0],
        );
    });

    it('persists a candidate and selects it for MATCHED', async () => {
        const fixture = createFixture();

        fixture.createAttempt.mockResolvedValue({ id: attemptId });
        fixture.queryRaw.mockResolvedValue([{ id: candidateId }]);
        fixture.updateAttempt.mockResolvedValue({ count: 1 });

        await expect(
            fixture.repository.saveAtomically(matchedCommand()),
        ).resolves.toEqual({ attemptId });

        expect(fixture.queryRaw).toHaveBeenCalledTimes(1);

        const statement = fixture.queryRaw.mock.calls[0][0] as {
            readonly strings: readonly string[];
            readonly values: readonly unknown[];
        };

        expect(statement.values).toEqual([
            tenantId,
            attemptId,
            datasetId,
            referenceId,
            1,
            1,
            JSON.stringify({
                streetType: 0.1,
                streetIdentifier: 0.3,
                generatingRoad: 0.25,
                plateNumber: 0.3,
                neighborhood: 0.05,
            }),
            'LOCAL_CATALOG',
            'ENTRANCE',
            -74.8271,
            11.0132,
        ]);

        expect(statement.strings.join(' ')).toMatch(
            /ST_SetSRID\s*\(\s*ST_MakePoint\s*\(/,
        );

        expect(fixture.updateAttempt).toHaveBeenCalledWith({
            where: {
                tenantId,
                id: attemptId,
            },
            data: {
                selectedCandidateId: candidateId,
            },
        });
    });

    it('propagates a candidate insertion failure', async () => {
        const fixture = createFixture();

        fixture.createAttempt.mockResolvedValue({ id: attemptId });
        fixture.queryRaw.mockRejectedValue(new Error('CANDIDATE_INSERT_FAILED'));

        await expect(
            fixture.repository.saveAtomically(matchedCommand()),
        ).rejects.toThrow('CANDIDATE_INSERT_FAILED');

        expect(fixture.updateAttempt).not.toHaveBeenCalled();
    });
});