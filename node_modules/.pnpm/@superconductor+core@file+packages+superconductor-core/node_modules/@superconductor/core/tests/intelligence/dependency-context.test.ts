import { DependencyContextManager, PackageJsonParser } from '../../src/intelligence/dependency-context';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('DependencyContextManager', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-test-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('PackageJsonParser should parse dependencies', () => {
        const parser = new PackageJsonParser();
        expect(parser.appliesTo('package.json')).toBe(true);
        expect(parser.appliesTo('other.json')).toBe(false);

        const content = JSON.stringify({
            dependencies: { "a": "1.0.0" },
            devDependencies: { "b": "2.0.0" }
        });
        const deps = parser.parse(content);
        expect(deps).toEqual({ a: "1.0.0", b: "2.0.0" });
    });

    it('PackageJsonParser should handle invalid json gracefully', () => {
        const parser = new PackageJsonParser();
        expect(parser.parse('not json')).toEqual({});
    });

    it('DependencyContextManager should find package.json and extract dependencies', () => {
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
            dependencies: { "react": "^18.0.0" }
        }));
        
        const manager = new DependencyContextManager();
        const deps = manager.getDependencies(tempDir);
        expect(deps).toEqual({ "react": "^18.0.0" });
    });

    it('DependencyContextManager should handle non-existent directory gracefully', () => {
        const manager = new DependencyContextManager();
        const deps = manager.getDependencies('/non/existent/dir/12345');
        expect(deps).toEqual({});
    });

    it('DependencyContextManager should handle null or undefined input', () => {
        const manager = new DependencyContextManager();
        const deps = manager.getDependencies(null as any);
        expect(deps).toEqual({});
    });
});
