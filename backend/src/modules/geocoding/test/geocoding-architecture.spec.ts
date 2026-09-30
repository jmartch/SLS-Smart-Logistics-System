import { Dirent, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const moduleRoot = join(process.cwd(), 'src', 'modules', 'geocoding');

function typescriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(
        (entry: Dirent) => {
            const path = join(directory, entry.name);

            if (entry.isDirectory()) {
                return typescriptFiles(path);
            }

            return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
        },
    );
}

function importsFrom(file: string): string[] {
    const source = readFileSync(file, 'utf8');

    const fromImports = [
        ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);

    const sideEffectImports = [
        ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);

    return [...fromImports, ...sideEffectImports];
}

function violations(
    directory: string,
    forbidden: (specifier: string) => boolean,
): string[] {
    return typescriptFiles(directory).flatMap((file) =>
        importsFrom(file)
            .filter(forbidden)
            .map(
                (specifier) =>
                    `${relative(moduleRoot, file)} imports ${specifier}`,
            ),
    );
}

function importsFrameworkOrDatabase(specifier: string): boolean {
    return (
        specifier.startsWith('@nestjs/') ||
        specifier.startsWith('@prisma/') ||
        specifier.includes('generated/prisma') ||
        specifier.includes('database/prisma')
    );
}

describe('Geocoding architecture boundaries', () => {
    it('keeps domain independent from outer layers and frameworks', () => {
        const result = violations(
            join(moduleRoot, 'domain'),
            (specifier) =>
                /(^|\/)(application|infrastructure|presentation)(\/|$)/.test(
                    specifier,
                ) || importsFrameworkOrDatabase(specifier),
        );

        expect(result).toEqual([]);
    });

    it('keeps application independent from infrastructure and presentation', () => {
        const result = violations(
            join(moduleRoot, 'application'),
            (specifier) =>
                /(^|\/)(infrastructure|presentation)(\/|$)/.test(specifier) ||
                importsFrameworkOrDatabase(specifier),
        );

        expect(result).toEqual([]);
    });
});