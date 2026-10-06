import * as fs from 'fs';
import * as path from 'path';
import {
  DeliveryDomainError,
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryStateConflictError,
  DeliveryValidationError,
  IdempotencyConflictError,
  StopStateConflictError,
} from '../domain/delivery-errors';

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

describe('Clean Architecture Import Boundaries for Deliveries Module', () => {
  const deliveriesRoot = path.resolve(__dirname, '..');
  const domainDir = path.join(deliveriesRoot, 'domain');
  const applicationDir = path.join(deliveriesRoot, 'application');

  const forbiddenFrameworkPackages = [
    '@nestjs',
    '@prisma',
    'prisma',
    'express',
    'supertest',
    'multer',
  ];

  it('domain layer must NOT import framework packages, application, infrastructure, or presentation', () => {
    // Arrange
    const domainFiles = getFilesRecursively(domainDir);
    expect(domainFiles.length).toBeGreaterThan(0);

    const violations: { file: string; forbiddenImport: string }[] = [];

    // Act
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
            file: path.relative(deliveriesRoot, file),
            forbiddenImport: imp,
          });
        }
      }
    }

    // Assert
    expect(violations).toEqual([]);
  });

  it('application layer must NOT import framework packages, infrastructure, or presentation', () => {
    // Arrange
    const applicationFiles = getFilesRecursively(applicationDir);
    expect(applicationFiles.length).toBeGreaterThan(0);

    const violations: { file: string; forbiddenImport: string }[] = [];

    // Act
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
            file: path.relative(deliveriesRoot, file),
            forbiddenImport: imp,
          });
        }
      }
    }

    // Assert
    expect(violations).toEqual([]);
  });

  it('domain errors must inherit from DeliveryDomainError with uppercase codes', () => {
    // Arrange
    const errorClasses = [
      DeliveryNotFoundError,
      DeliveryStateConflictError,
      IdempotencyConflictError,
      DeliveryForbiddenError,
      StopStateConflictError,
      DeliveryValidationError,
    ];

    // Act & Assert
    for (const ErrorClass of errorClasses) {
      const instance = new ErrorClass('test message');
      expect(instance).toBeInstanceOf(DeliveryDomainError);
      expect(instance.code).toMatch(/^[A-Z_]+$/);
    }
  });
});
