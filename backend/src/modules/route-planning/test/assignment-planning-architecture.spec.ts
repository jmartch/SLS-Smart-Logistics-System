import * as fs from 'fs';
import * as path from 'path';

describe('Assignment Planning Architecture Boundaries (CA-07)', () => {
    const applicationPortsDir = path.resolve(__dirname, '../application/ports');
    const applicationDir = path.resolve(__dirname, '../application');

    function getTsFiles(dir: string): string[] {
        if (!fs.existsSync(dir)) return [];
        const files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...getTsFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.ts')) {
                files.push(fullPath);
            }
        }
        return files;
    }

    describe('ports layer independence', () => {
        const portFiles = getTsFiles(applicationPortsDir);

        it('has port files to verify', () => {
            expect(portFiles.length).toBeGreaterThan(0);
        });

        it.each(
            portFiles.map((file) => [path.relative(applicationPortsDir, file), file]),
        )(
            'port file %s does not import forbidden frameworks or infrastructure',
            (_relPath, absPath) => {
                const content = fs.readFileSync(absPath, 'utf8');

                expect(content).not.toMatch(/from\s+['"]@nestjs/);
                expect(content).not.toMatch(/from\s+['"]@prisma/);
                expect(content).not.toMatch(/from\s+['"].*\/infrastructure/);
                expect(content).not.toMatch(/from\s+['"].*\/presentation/);
            },
        );
    });

    describe('application layer independence for planning and assignment', () => {
        const appFiles = getTsFiles(applicationDir).filter(
            (file) =>
                file.includes('plan-and-assign-routes') ||
                file.includes('planning-assignment'),
        );

        it.each(
            appFiles.map((file) => [path.relative(applicationDir, file), file]),
        )(
            'file %s does not import forbidden modules or infrastructure',
            (_relPath, absPath) => {
                const content = fs.readFileSync(absPath, 'utf8');

                expect(content).not.toMatch(/from\s+['"]@nestjs/);
                expect(content).not.toMatch(/from\s+['"]@prisma/);
                expect(content).not.toMatch(/from\s+['"].*\/infrastructure/);
                expect(content).not.toMatch(/from\s+['"].*\/presentation/);
            },
        );
    });
});