import * as fs from 'fs';
import * as path from 'path';

describe('Route Planning Architecture Boundaries', () => {
  const domainDir = path.resolve(__dirname, '../domain');
  const applicationDir = path.resolve(__dirname, '../application');

  function getAllTsFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  describe('domain layer independence', () => {
    const domainFiles = getAllTsFiles(domainDir);

    it('has domain files to check', () => {
      expect(domainFiles.length).toBeGreaterThan(0);
    });

    it.each(domainFiles.map((file) => [path.relative(domainDir, file), file]))(
      'file %s does not import from forbidden layers (NestJS, Prisma, application, infrastructure, presentation)',
      (_relPath, absPath) => {
        const content = fs.readFileSync(absPath, 'utf8');

        // Forbidden imports in domain
        expect(content).not.toMatch(/from\s+['"]@nestjs/);
        expect(content).not.toMatch(/from\s+['"]@prisma/);
        expect(content).not.toMatch(/from\s+['"].*\/infrastructure/);
        expect(content).not.toMatch(/from\s+['"].*\/application/);
        expect(content).not.toMatch(/from\s+['"].*\/presentation/);
      },
    );
  });

  describe('application layer boundaries', () => {
    const applicationFiles = getAllTsFiles(applicationDir);

    it('has application files to check', () => {
      expect(applicationFiles.length).toBeGreaterThan(0);
    });

    it.each(applicationFiles.map((file) => [path.relative(applicationDir, file), file]))(
      'file %s does not import from infrastructure or presentation',
      (_relPath, absPath) => {
        const content = fs.readFileSync(absPath, 'utf8');

        expect(content).not.toMatch(/from\s+['"]@prisma/);
        expect(content).not.toMatch(/from\s+['"].*\/infrastructure/);
        expect(content).not.toMatch(/from\s+['"].*\/presentation/);
      },
    );
  });
});
