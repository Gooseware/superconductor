import * as fs from 'fs';
import * as path from 'path';

export interface ManifestParser {
    parse(content: string): Record<string, string>;
    appliesTo(fileName: string): boolean;
}

export class PackageJsonParser implements ManifestParser {
    parse(content: string): Record<string, string> {
        try {
            const data = JSON.parse(content);
            if (!data || typeof data !== 'object') return {};
            const deps = (typeof data.dependencies === 'object' && data.dependencies !== null) ? data.dependencies : {};
            const devDeps = (typeof data.devDependencies === 'object' && data.devDependencies !== null) ? data.devDependencies : {};
            return { ...deps, ...devDeps };
        } catch (e) {
            return {};
        }
    }

    appliesTo(fileName: string): boolean {
        return fileName === 'package.json';
    }
}

export class DependencyContextManager {
    private parsers: ManifestParser[] = [];

    constructor(parsers?: ManifestParser[]) {
        if (parsers) {
            this.parsers = parsers;
        } else {
            this.parsers = [new PackageJsonParser()];
        }
    }

    registerParser(parser: ManifestParser): void {
        this.parsers.push(parser);
    }

    getDependencies(workspaceDir: string): Record<string, string> {
        if (!workspaceDir || typeof workspaceDir !== 'string') {
             return {};
        }

        let allDeps: Record<string, string> = {};
        try {
            const files = fs.readdirSync(workspaceDir);
            for (const file of files) {
                for (const parser of this.parsers) {
                    if (parser.appliesTo(file)) {
                        try {
                            const content = fs.readFileSync(path.join(workspaceDir, file), 'utf-8');
                            allDeps = { ...allDeps, ...parser.parse(content) };
                        } catch (e) {
                            // Defensive validation / failure handling for individual files
                        }
                    }
                }
            }
        } catch (e) {
            // Failure reading the directory
            return {};
        }
        return allDeps;
    }
}
