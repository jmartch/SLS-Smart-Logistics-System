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

describe('Clean Architecture Import Boundaries for Messaging and Audit', () => {
  const messagingAppDir = path.resolve(
    __dirname,
    '../../application/messaging',
  );
  const auditAppDir = path.resolve(
    __dirname,
    '../../../modules/audit/application',
  );

  const forbiddenPackages = [
    '@nestjs',
    '@prisma',
    'prisma',
    'amqplib',
    'express',
    'supertest',
  ];

  it('shared/application/messaging must not import framework, ORM, or transport packages', () => {
    const files = getFilesRecursively(messagingAppDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const imports = extractImports(file);
      for (const imp of imports) {
        for (const pkg of forbiddenPackages) {
          expect(imp.startsWith(pkg)).toBe(false);
        }
        // No relative imports to infrastructure or presentation
        expect(imp.includes('/infrastructure/')).toBe(false);
        expect(imp.includes('/presentation/')).toBe(false);
      }
    }
  });

  it('modules/audit/application must not import framework, ORM, or transport packages', () => {
    const files = getFilesRecursively(auditAppDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const imports = extractImports(file);
      for (const imp of imports) {
        for (const pkg of forbiddenPackages) {
          expect(imp.startsWith(pkg)).toBe(false);
        }
        // No relative imports to infrastructure or presentation
        expect(imp.includes('/infrastructure/')).toBe(false);
        expect(imp.includes('/presentation/')).toBe(false);
      }
    }
  });
});
