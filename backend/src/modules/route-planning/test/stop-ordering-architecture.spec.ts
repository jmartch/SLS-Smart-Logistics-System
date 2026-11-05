import * as fs from 'fs';
import * as path from 'path';

describe('Stop Ordering Architecture Boundaries', () => {
    const domainDir = path.resolve(__dirname, '../domain');

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

    describe('domain layer independence for stop-ordering', () => {
        const domainFiles = getAllTsFiles(domainDir).filter((file) =>
            file.includes('stop-ordering'),
        );

        it('finds stop-ordering domain files to verify', () => {
            expect(domainFiles.length).toBeGreaterThan(0);
        });

        it.each(domainFiles.map((file) => [path.relative(domainDir, file), file]))(
            'file %s does not import forbidden modules or frameworks',
            (_relPath, absPath) => {
                const content = fs.readFileSync(absPath, 'utf8');

                expect(content).not.toMatch(/from\s+['"]@nestjs/);
                expect(content).not.toMatch(/from\s+['"]@prisma/);
                expect(content).not.toMatch(/from\s+['"].*\/infrastructure/);
                expect(content).not.toMatch(/from\s+['"].*\/application/);
                expect(content).not.toMatch(/from\s+['"].*\/presentation/);
            },
        );
    });
});