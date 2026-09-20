import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runPackageSurface } from './package-surface.js';

describe('runPackageSurface', () => {
  let tempRoot: string;
  let tempOutput: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-pkg-surf-root-'));
    tempOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-pkg-surf-out-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
      if (fs.existsSync(tempOutput)) {
        fs.rmSync(tempOutput, { recursive: true, force: true });
      }
    } catch (_e) {}
  });

  describe('Monorepo projects (with packages/)', () => {
    it('scans packages/ directory and aggregates package.json dependencies and source imports', () => {
      const rootPkgJson = {
        name: 'my-monorepo',
        devDependencies: { typescript: '^5.0.0' },
      };
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify(rootPkgJson, null, 2));

      const pkgADir = path.join(tempRoot, 'packages', 'pkg-a');
      const pkgASrc = path.join(pkgADir, 'src');
      fs.mkdirSync(pkgASrc, { recursive: true });
      fs.writeFileSync(
        path.join(pkgADir, 'package.json'),
        JSON.stringify({
          name: 'pkg-a',
          dependencies: { lodash: '^4.17.21' },
        }, null, 2)
      );
      fs.writeFileSync(
        path.join(pkgASrc, 'index.ts'),
        `import { debounce } from 'lodash';\nimport * as fs from 'fs';\nexport const a = 1;`
      );

      const pkgBDir = path.join(tempRoot, 'packages', 'pkg-b');
      const pkgBSrc = path.join(pkgBDir, 'src');
      fs.mkdirSync(pkgBSrc, { recursive: true });
      fs.writeFileSync(
        path.join(pkgBDir, 'package.json'),
        JSON.stringify({
          name: 'pkg-b',
          dependencies: { chalk: '^5.0.0' },
        }, null, 2)
      );
      fs.writeFileSync(
        path.join(pkgBSrc, 'index.ts'),
        `import chalk from 'chalk';\nexport const b = 2;`
      );

      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');
      expect(result.entries).toBeNull();

      const outFile = path.join(tempOutput, '08_package_surface.json');
      expect(fs.existsSync(outFile)).toBe(true);

      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));

      expect(surface.lodash).toBeDefined();
      expect(surface.lodash.version).toBe('^4.17.21');
      expect(surface.lodash.usedApis).toContain('debounce');
      expect(surface.lodash.importedBy).toContain('packages/pkg-a/src/index.ts');
      expect(surface.lodash.isNodeBuiltin).toBe(false);

      expect(surface.chalk).toBeDefined();
      expect(surface.chalk.version).toBe('^5.0.0');
      expect(surface.chalk.importedBy).toContain('packages/pkg-b/src/index.ts');

      expect(surface.fs).toBeDefined();
      expect(surface.fs.version).toBe('node-builtin');
      expect(surface.fs.isNodeBuiltin).toBe(true);
    });
  });

  describe('Next.js projects (src/app and app/)', () => {
    it('scans src/app in Next.js without packages/ directory and discovers dependencies', () => {
      // Ensure packages/ does NOT exist
      expect(fs.existsSync(path.join(tempRoot, 'packages'))).toBe(false);

      const rootPkgJson = {
        name: 'my-nextjs-app',
        dependencies: {
          react: '^18.3.0',
          next: '^14.2.0',
        },
      };
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify(rootPkgJson, null, 2));

      const srcAppDir = path.join(tempRoot, 'src', 'app');
      fs.mkdirSync(srcAppDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcAppDir, 'page.tsx'),
        `import React, { useState, useEffect } from 'react';\nimport Link from 'next/link';\nexport default function Page() { return null; }`
      );

      fs.writeFileSync(
        path.join(srcAppDir, 'layout.tsx'),
        `import React from 'react';\nexport default function Layout() { return null; }`
      );

      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');

      const outFile = path.join(tempOutput, '08_package_surface.json');
      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));

      expect(surface.react).toBeDefined();
      expect(surface.react.version).toBe('^18.3.0');
      expect(surface.react.usedApis).toContain('useState');
      expect(surface.react.usedApis).toContain('useEffect');
      expect(surface.react.importedBy).toContain('src/app/page.tsx');
      expect(surface.react.importedBy).toContain('src/app/layout.tsx');

      expect(surface['next/link']).toBeDefined();
      expect(surface['next/link'].usedApis).toContain('Link');
    });

    it('scans root app/ directory when src/ is not used', () => {
      expect(fs.existsSync(path.join(tempRoot, 'packages'))).toBe(false);
      expect(fs.existsSync(path.join(tempRoot, 'src'))).toBe(false);

      const rootPkgJson = {
        name: 'nextjs-root-app',
        dependencies: {
          react: '^18.3.0',
        },
      };
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify(rootPkgJson, null, 2));

      const appDir = path.join(tempRoot, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, 'page.tsx'),
        `import { useState } from 'react';\nexport default function Page() { return null; }`
      );

      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');

      const outFile = path.join(tempOutput, '08_package_surface.json');
      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));

      expect(surface.react).toBeDefined();
      expect(surface.react.importedBy).toContain('app/page.tsx');
    });
  });

  describe('Go projects (cmd/)', () => {
    it('handles Go projects with cmd/ directory containing Go files gracefully without throwing', () => {
      // Pure Go project structure
      expect(fs.existsSync(path.join(tempRoot, 'packages'))).toBe(false);
      expect(fs.existsSync(path.join(tempRoot, 'package.json'))).toBe(false);

      fs.writeFileSync(path.join(tempRoot, 'go.mod'), 'module example.com/myservice\n\ngo 1.22\n');

      const cmdDir = path.join(tempRoot, 'cmd', 'server');
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.writeFileSync(
        path.join(cmdDir, 'main.go'),
        `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hello world")\n}\n`
      );

      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');
      expect(result.entries).toBeNull();

      const outFile = path.join(tempOutput, '08_package_surface.json');
      expect(fs.existsSync(outFile)).toBe(true);
      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(surface).toEqual({});
    });

    it('scans JS/TS files in cmd/ if present in polyglot or fullstack Go projects', () => {
      expect(fs.existsSync(path.join(tempRoot, 'packages'))).toBe(false);

      fs.writeFileSync(
        path.join(tempRoot, 'package.json'),
        JSON.stringify({ dependencies: { axios: '^1.6.0' } }, null, 2)
      );

      const cmdDir = path.join(tempRoot, 'cmd', 'cli-tool');
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.writeFileSync(
        path.join(cmdDir, 'index.ts'),
        `import axios from 'axios';\nexport const run = () => axios.get('/api');`
      );

      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');
      const outFile = path.join(tempOutput, '08_package_surface.json');
      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(surface.axios).toBeDefined();
      expect(surface.axios.version).toBe('^1.6.0');
      expect(surface.axios.importedBy).toContain('cmd/cli-tool/index.ts');
    });
  });

  describe('Repos without packages/ (standard src and lib)', () => {
    it('scans src and lib directories and never throws ENOENT for missing packages/', () => {
      expect(fs.existsSync(path.join(tempRoot, 'packages'))).toBe(false);

      fs.writeFileSync(
        path.join(tempRoot, 'package.json'),
        JSON.stringify({
          dependencies: { express: '^4.18.2' },
        }, null, 2)
      );

      const srcDir = path.join(tempRoot, 'src');
      const libDir = path.join(tempRoot, 'lib');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(libDir, { recursive: true });

      fs.writeFileSync(
        path.join(srcDir, 'app.ts'),
        `import express from 'express';\nexport const app = express();`
      );

      fs.writeFileSync(
        path.join(libDir, 'util.js'),
        `import path from 'path';\nexport const u = path.resolve('.');`
      );

      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');
      const outFile = path.join(tempOutput, '08_package_surface.json');
      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));

      expect(surface.express).toBeDefined();
      expect(surface.express.version).toBe('^4.18.2');
      expect(surface.express.importedBy).toContain('src/app.ts');

      expect(surface.path).toBeDefined();
      expect(surface.path.isNodeBuiltin).toBe(true);
      expect(surface.path.importedBy).toContain('lib/util.js');
    });
  });

  describe('Empty repositories and repos with no standard directories', () => {
    it('handles completely empty repository returning an empty surface with ok status', () => {
      // Empty directory
      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');
      expect(result.entries).toBeNull();

      const outFile = path.join(tempOutput, '08_package_surface.json');
      expect(fs.existsSync(outFile)).toBe(true);
      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(surface).toEqual({});
    });

    it('handles repository with only documentation or non-code files', () => {
      fs.writeFileSync(path.join(tempRoot, 'README.md'), '# Documentation\n');
      const docsDir = path.join(tempRoot, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'guide.md'), 'Guide content\n');

      const result = runPackageSurface(tempRoot, tempOutput);

      expect(result.status).toBe('ok');
      const outFile = path.join(tempOutput, '08_package_surface.json');
      expect(fs.existsSync(outFile)).toBe(true);
      const surface = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(surface).toEqual({});
    });

    it('automatically creates outputDir if it does not already exist', () => {
      const nestedOutput = path.join(tempOutput, 'nested', 'intel');
      expect(fs.existsSync(nestedOutput)).toBe(false);

      const result = runPackageSurface(tempRoot, nestedOutput);

      expect(result.status).toBe('ok');
      expect(fs.existsSync(path.join(nestedOutput, '08_package_surface.json'))).toBe(true);
    });
  });

  describe('Scoped mode', () => {
    it('returns entries array when scopedFiles are provided in non-monorepo', () => {
      fs.writeFileSync(
        path.join(tempRoot, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.18.2' } }, null, 2)
      );
      const srcDir = path.join(tempRoot, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'index.ts'),
        `import express from 'express';\n`
      );

      const result = runPackageSurface(tempRoot, tempOutput, ['src/index.ts']);

      expect(result.status).toBe('ok');
      expect(Array.isArray(result.entries)).toBe(true);
      const expressEntry = (result.entries as any[])?.find((e: any) => e.file === 'express');
      expect(expressEntry).toBeDefined();
      expect(expressEntry.version).toBe('^4.18.2');
    });
  });
});
