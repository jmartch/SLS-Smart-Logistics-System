import * as fs from 'fs';
import * as path from 'path';

function getFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const importRegex =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }
  return imports;
}

describe('Clean Architecture Import Boundaries for Routes Module', () => {
  const routesRoot = path.resolve(__dirname, '..');
  const domainDir = path.join(routesRoot, 'domain');
  const applicationDir = path.join(routesRoot, 'application');

  const forbiddenFrameworkPackages = [
    '@nestjs',
    '@prisma',
    'prisma',
    'express',
    'supertest',
  ];

  it('domain layer must NOT import framework packages, application, infrastructure, or presentation', () => {
    const domainFiles = getFilesRecursively(domainDir);
    expect(domainFiles.length).toBeGreaterThan(0);

    const violations: { file: string; forbiddenImport: string }[] = [];

    for (const file of domainFiles) {
      const imports = extractImports(file);
      for (const imp of imports) {
        const isFrameworkForbidden = forbiddenFrameworkPackages.some((pkg) =>
          imp.startsWith(pkg),
        );
        const isLayerForbidden =
          imp.includes('/application/') ||
          imp.includes('/infrastructure/') ||
          imp.includes('/presentation/');

        if (isFrameworkForbidden || isLayerForbidden) {
          violations.push({
            file: path.relative(routesRoot, file),
            forbiddenImport: imp,
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('application layer must NOT import framework packages, infrastructure, or presentation', () => {
    const applicationFiles = getFilesRecursively(applicationDir);
    expect(applicationFiles.length).toBeGreaterThan(0);

    const violations: { file: string; forbiddenImport: string }[] = [];

    for (const file of applicationFiles) {
      const imports = extractImports(file);
      for (const imp of imports) {
        const isFrameworkForbidden = forbiddenFrameworkPackages.some((pkg) =>
          imp.startsWith(pkg),
        );
        const isLayerForbidden =
          imp.includes('/infrastructure/') || imp.includes('/presentation/');

        if (isFrameworkForbidden || isLayerForbidden) {
          violations.push({
            file: path.relative(routesRoot, file),
            forbiddenImport: imp,
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('domain errors must inherit from RouteDomainError with uppercase codes', async () => {
    const routeErrorsModule = await import('../domain/route-errors.js');
    const errorClasses = [
      routeErrorsModule.RouteNotFoundError,
      routeErrorsModule.RouteStateConflictError,
      routeErrorsModule.RouteManifestInvalidError,
      routeErrorsModule.RouteResourceUnavailableError,
      routeErrorsModule.RouteForbiddenError,
      routeErrorsModule.RouteConcurrencyConflictError,
      routeErrorsModule.RouteValidationError,
      routeErrorsModule.RouteCustodyUnresolvedError,
      routeErrorsModule.RouteManifestEmptyError,
      routeErrorsModule.RouteManifestInconsistentError,
      routeErrorsModule.RouteHasPendingStopsError,
      routeErrorsModule.RouteAlreadyCompletedError,
      routeErrorsModule.RouteNotCompletedError,
      routeErrorsModule.IdempotencyKeyReusedError,
    ];

    for (const ErrorClass of errorClasses) {
      const instance = new (ErrorClass as any)('test-param');
      expect(instance).toBeInstanceOf(routeErrorsModule.RouteDomainError);
      expect(instance.code).toMatch(/^[A-Z_]+$/);
    }
  });
});
