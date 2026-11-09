import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function getImportsFromFile(relativePath: string): string[] {
    const fullPath = join(process.cwd(), relativePath);
    const content = readFileSync(fullPath, 'utf8');

    const fromMatches = [...content.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
        (m) => m[1],
    );
    const sideEffectMatches = [
        ...content.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    ].map((m) => m[1]);

    return [...fromMatches, ...sideEffectMatches];
}

function isForbiddenDomainImport(specifier: string): boolean {
    return (
        specifier.startsWith('@nestjs/') ||
        specifier.startsWith('@prisma/') ||
        specifier.includes('application') ||
        specifier.includes('infrastructure') ||
        specifier.includes('presentation')
    );
}

function isForbiddenApplicationImport(specifier: string): boolean {
    return (
        specifier.startsWith('@nestjs/') ||
        specifier.startsWith('@prisma/') ||
        specifier.includes('infrastructure') ||
        specifier.includes('presentation')
    );
}

describe('Package Geocoding Architecture Boundaries', () => {
    const domainFiles = [
        'src/modules/geocoding/domain/network-attachment.types.ts',
        'src/modules/geocoding/domain/network-attachment.policy.ts',
        'src/modules/geocoding/domain/invalid-network-attachment-policy.error.ts',
        'src/modules/packages/domain/package-geocoding.types.ts',
        'src/modules/packages/domain/package-geocoding.policy.ts',
        'src/modules/packages/domain/package-errors.ts',
    ];

    const applicationFiles = [
        'src/modules/geocoding/application/ports/network-attachment.port.ts',
        'src/modules/packages/application/ports/package-geocoding.uow.port.ts',
        'src/modules/packages/application/ports/package-geocoding-config.port.ts',
        'src/modules/packages/application/ports/package-geocoding-repository.port.ts',
        'src/modules/packages/application/ports/package-geocoding-audit.port.ts',
        'src/modules/packages/application/helpers/package-geocoding-diagnostic.helper.ts',
        'src/modules/packages/application/resolve-package-geocoding.use-case.ts',
        'src/modules/packages/application/register-and-geocode-package.use-case.ts',
        'src/modules/packages/application/review-package-geocoding.use-case.ts',
        'src/modules/packages/application/correct-package-address.use-case.ts',
        'src/modules/packages/application/get-package-detail.use-case.ts',
        'src/modules/route-planning/application/get-planning-workspace.service.ts',
    ];

    const persistenceAdapters = [
        'src/modules/packages/infrastructure/prisma-package-query.adapter.ts',
        'src/modules/packages/infrastructure/prisma-package-geocoding.uow.ts',
        'src/modules/route-planning/infrastructure/prisma-planning-workspace-query.adapter.ts',
    ];

    it.each(domainFiles)(
        'verifies domain file %s does not import application, infrastructure or frameworks',
        (file) => {
            const imports = getImportsFromFile(file);
            const violations = imports.filter(isForbiddenDomainImport);

            expect(violations).toEqual([]);
        },
    );

    it.each(applicationFiles)(
        'verifies application file %s does not import infrastructure, presentation or frameworks',
        (file) => {
            const imports = getImportsFromFile(file);
            const violations = imports.filter(isForbiddenApplicationImport);

            expect(violations).toEqual([]);
        },
    );

    it.each(persistenceAdapters)(
        'verifies persistence adapter %s does not import domain policy PackageGeocodingPolicy',
        (file) => {
            const imports = getImportsFromFile(file);
            const policyImports = imports.filter((i) =>
                i.includes('package-geocoding.policy'),
            );

            expect(policyImports).toEqual([]);
        },
    );
});
