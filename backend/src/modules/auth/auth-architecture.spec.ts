import { Dirent, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const moduleRoot = join(process.cwd(), 'src', 'modules', 'auth');

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

  return [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
}

function violations(
  directory: string,
  forbidden: (specifier: string) => boolean,
): string[] {
  return typescriptFiles(directory).flatMap((file) =>
    importsFrom(file)
      .filter(forbidden)
      .map((specifier) => `${relative(moduleRoot, file)} imports ${specifier}`),
  );
}

function importsDatabase(specifier: string): boolean {
  return (
    specifier.startsWith('@prisma/') ||
    specifier.includes('generated/prisma') ||
    specifier.includes('/database/')
  );
}

// AGENTS.md section 8: domain depends on nothing outside itself; application
// may use @nestjs/common only for @Injectable() (as the other modules do) and
// never reaches infrastructure, presentation or the database client.
describe('Auth architecture boundaries', () => {
  it('scans a non-empty set of domain and application files', () => {
    // Guards against the rules below passing vacuously after a move or rename.
    expect(typescriptFiles(join(moduleRoot, 'domain')).length).toBeGreaterThan(
      0,
    );
    expect(
      typescriptFiles(join(moduleRoot, 'application')).length,
    ).toBeGreaterThan(0);
  });

  it('keeps domain independent from outer layers and frameworks', () => {
    const result = violations(
      join(moduleRoot, 'domain'),
      (specifier) =>
        /(^|\/)(application|infrastructure|presentation)(\/|$)/.test(
          specifier,
        ) ||
        specifier.startsWith('@nestjs/') ||
        importsDatabase(specifier),
    );

    expect(result).toEqual([]);
  });

  it('keeps application independent from infrastructure, presentation and the database', () => {
    const result = violations(
      join(moduleRoot, 'application'),
      (specifier) =>
        /(^|\/)(infrastructure|presentation)(\/|$)/.test(specifier) ||
        (specifier.startsWith('@nestjs/') && specifier !== '@nestjs/common') ||
        importsDatabase(specifier),
    );

    expect(result).toEqual([]);
  });
});
