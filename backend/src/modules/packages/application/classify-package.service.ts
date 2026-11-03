import {
    isPackageUuid,
    parsePackageClassification,
} from '../domain/package-classification';
import { PackageNotFoundError } from '../domain/package-errors';
import {
    evaluateClassificationReferences,
    type PackageClassificationReferenceFailure,
} from '../domain/package-reference.policy';
import { PackageStatus } from '../domain/package-state.types';
import type {
    ClassifiedPackage,
    PackageClassificationContext,
    PackageClassificationPort,
} from './ports/package-classification.port';

export type ClassifyPackageResult =
    | { readonly ok: true; readonly package: ClassifiedPackage }
    | { readonly ok: false; readonly code: PackageClassificationReferenceFailure };

export class ClassifyPackageService {
    constructor(private readonly classification: PackageClassificationPort) {}

    async execute(
        context: PackageClassificationContext,
        packageId: string,
        input: unknown,
    ): Promise<ClassifyPackageResult> {
        if (!isPackageUuid(packageId)) {
            throw new PackageNotFoundError(packageId);
        }

        const data = parsePackageClassification(input);

        const references =
            await this.classification.loadClassificationReferences(
                context.tenantId,
                data,
            );

        const failure = evaluateClassificationReferences(data, references);

        if (failure) {
            return { ok: false, code: failure };
        }

        const outcome = await this.classification.classifyAtomically(
            context,
            packageId,
            data,
            (packageAggregate) => {
                packageAggregate.transitionTo(PackageStatus.CLASSIFIED, {
                    changedByUserId: context.actorUserId,
                    reasonCode: 'PACKAGE_CLASSIFIED',
                    correlationId: context.correlationId,
                });
            },
        );

        if (!outcome.ok) {
            throw new PackageNotFoundError(packageId);
        }

        return outcome;
    }
}
