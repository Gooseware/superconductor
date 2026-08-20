import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { LanguagePersonaResolver, LanguagePersona } from '../../src/swarm/LanguagePersonaResolver.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('LanguagePersonaResolver', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-resolver-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('resolveFromProject', () => {
    it('detects Rust from Cargo.toml and tech-stack.md', () => {
      // Test Cargo.toml
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "my_crate"\nversion = "0.1.0"');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('rust');

      // Test tech-stack.md
      fs.rmSync(path.join(tempDir, 'Cargo.toml'));
      fs.writeFileSync(path.join(tempDir, 'tech-stack.md'), '# Technology Stack\n- Language: Rust\n- Framework: Tokio');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('rust');
    });

    it('detects Go from go.mod and tech-stack.md', () => {
      // Test go.mod
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example.com/app\n\ngo 1.22');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('go');

      // Test tech-stack.md with golang
      fs.rmSync(path.join(tempDir, 'go.mod'));
      fs.writeFileSync(path.join(tempDir, 'tech-stack.md'), 'Primary backend: Golang / Gin');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('go');
    });

    it('detects Python from pyproject.toml, requirements.txt, and tech-stack.md', () => {
      // Test pyproject.toml
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), '[project]\nname = "my_pkg"\nversion = "0.1.0"');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('python');

      // Test requirements.txt
      fs.rmSync(path.join(tempDir, 'pyproject.toml'));
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'fastapi>=0.100.0\nuvicorn');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('python');

      // Test tech-stack.md
      fs.rmSync(path.join(tempDir, 'requirements.txt'));
      fs.writeFileSync(path.join(tempDir, 'tech-stack.md'), 'Stack: Python 3.12, PyTorch');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('python');
    });

    it('detects Swift from Package.swift and *.xcodeproj', () => {
      // Test Package.swift
      fs.writeFileSync(path.join(tempDir, 'Package.swift'), '// swift-tools-version: 5.9\nimport PackageDescription');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('swift');

      // Test *.xcodeproj directory
      fs.rmSync(path.join(tempDir, 'Package.swift'));
      fs.mkdirSync(path.join(tempDir, 'MyApp.xcodeproj'));
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('swift');
    });

    it('detects TypeScript from package.json and tsconfig.json', () => {
      // Test tsconfig.json
      fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{ "compilerOptions": { "target": "ES2022" } }');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('typescript');

      // Test package.json
      fs.rmSync(path.join(tempDir, 'tsconfig.json'));
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'my-ts-app', dependencies: { typescript: '^5.0.0' } }));
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('typescript');
    });

    it('detects C++ from CMakeLists.txt and Makefile', () => {
      // Test CMakeLists.txt
      fs.writeFileSync(path.join(tempDir, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20)\nproject(MyCppApp CXX)');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('cpp');

      // Test Makefile with CXX / g++
      fs.rmSync(path.join(tempDir, 'CMakeLists.txt'));
      fs.writeFileSync(path.join(tempDir, 'Makefile'), 'CXX = g++\nall: main.cpp\n\t$(CXX) -o app main.cpp');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('cpp');
    });

    it('detects C# from *.csproj and *.sln', () => {
      // Test .csproj
      fs.writeFileSync(path.join(tempDir, 'MyApp.csproj'), '<Project Sdk="Microsoft.NET.Sdk">\n</Project>');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('csharp');

      // Test .sln
      fs.rmSync(path.join(tempDir, 'MyApp.csproj'));
      fs.writeFileSync(path.join(tempDir, 'MyApp.sln'), 'Microsoft Visual Studio Solution File, Format Version 12.00');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('csharp');
    });

    it('detects Kotlin from build.gradle.kts and build.gradle', () => {
      // Test build.gradle.kts
      fs.writeFileSync(path.join(tempDir, 'build.gradle.kts'), 'plugins { kotlin("jvm") version "1.9.20" }');
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('kotlin');

      // Test build.gradle with kotlin plugin
      fs.rmSync(path.join(tempDir, 'build.gradle.kts'));
      fs.writeFileSync(path.join(tempDir, 'build.gradle'), 'plugins { id "org.jetbrains.kotlin.jvm" version "1.9.20" }');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('kotlin');
    });

    it('detects Zig from build.zig', () => {
      fs.writeFileSync(path.join(tempDir, 'build.zig'), 'const std = @import("std");\npub fn build(b: *std.Build) void {}');
      const personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('zig');
    });

    it('detects UI Layout frameworks across ecosystems (React, Vue, Svelte, SwiftUI, Compose, Flutter, Slint, Qt)', () => {
      // React in package.json
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'web-ui',
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }
      }));
      let personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('typescript');
      expect(personas).toContain('ui-layout');

      // Vue in package.json
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'web-ui',
        dependencies: { vue: '^3.4.0' }
      }));
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('ui-layout');

      // Svelte in package.json
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'web-ui',
        devDependencies: { svelte: '^4.0.0' }
      }));
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('ui-layout');

      // Flutter pubspec.yaml
      fs.rmSync(path.join(tempDir, 'package.json'));
      fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: my_app\ndependencies:\n  flutter:\n    sdk: flutter');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('ui-layout');

      // Slint in Cargo.toml
      fs.rmSync(path.join(tempDir, 'pubspec.yaml'));
      fs.writeFileSync(path.join(tempDir, 'Cargo.toml'), '[package]\nname = "slint-app"\n[dependencies]\nslint = "1.5"');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('rust');
      expect(personas).toContain('ui-layout');

      // Qt in CMakeLists.txt
      fs.rmSync(path.join(tempDir, 'Cargo.toml'));
      fs.writeFileSync(path.join(tempDir, 'CMakeLists.txt'), 'find_package(Qt6 REQUIRED COMPONENTS Quick Widgets)');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('cpp');
      expect(personas).toContain('ui-layout');

      // Jetpack Compose in build.gradle.kts
      fs.rmSync(path.join(tempDir, 'CMakeLists.txt'));
      fs.writeFileSync(path.join(tempDir, 'build.gradle.kts'), 'dependencies { implementation("androidx.compose.ui:ui:1.6.0") }');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('kotlin');
      expect(personas).toContain('ui-layout');

      // SwiftUI in tech-stack.md
      fs.rmSync(path.join(tempDir, 'build.gradle.kts'));
      fs.writeFileSync(path.join(tempDir, 'tech-stack.md'), 'Frontend: SwiftUI iOS application');
      personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toContain('swift');
      expect(personas).toContain('ui-layout');
    });

    it('falls back to generic profile on unknown stack', () => {
      const personas = LanguagePersonaResolver.resolveFromProject(tempDir);
      expect(personas).toEqual(['generic']);
    });
  });

  describe('resolveFromDiff', () => {
    it('detects personas from git diff file extensions', () => {
      const diff1 = ['crates/auth/src/lib.rs', 'crates/auth/Cargo.toml'];
      expect(LanguagePersonaResolver.resolveFromDiff(diff1)).toEqual(['rust']);

      const diff2 = ['pkg/service/user.go', 'cmd/api/main.go'];
      expect(LanguagePersonaResolver.resolveFromDiff(diff2)).toEqual(['go']);

      const diff3 = ['src/components/Header.tsx', 'src/styles/theme.css'];
      const personas3 = LanguagePersonaResolver.resolveFromDiff(diff3);
      expect(personas3).toContain('typescript');
      expect(personas3).toContain('ui-layout');

      const diff4 = ['ios/Views/ProfileView.swift'];
      const personas4 = LanguagePersonaResolver.resolveFromDiff(diff4);
      expect(personas4).toContain('swift');
      expect(personas4).toContain('ui-layout');
    });

    it('detects polyglot stack when multiple language files are modified', () => {
      const polyglotDiff = [
        'backend/src/main.rs',
        'frontend/src/App.tsx',
        'scripts/deploy.py',
        'build.zig'
      ];
      const personas = LanguagePersonaResolver.resolveFromDiff(polyglotDiff);
      expect(personas).toContain('rust');
      expect(personas).toContain('typescript');
      expect(personas).toContain('ui-layout');
      expect(personas).toContain('python');
      expect(personas).toContain('zig');
    });

    it('falls back to generic when diff has no code files and no projectRoot', () => {
      const docDiff = ['README.md', 'LICENSE', 'docs/architecture.png'];
      expect(LanguagePersonaResolver.resolveFromDiff(docDiff)).toEqual(['generic']);
    });

    it('falls back to projectRoot resolution when diff has only non-code files', () => {
      fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test.com/demo\n\ngo 1.22');
      const docDiff = ['README.md'];
      const personas = LanguagePersonaResolver.resolveFromDiff(docDiff, tempDir);
      expect(personas).toContain('go');
    });
  });

  describe('getPersonaSkillPath', () => {
    it('returns relative skill path without projectRoot', () => {
      expect(LanguagePersonaResolver.getPersonaSkillPath('rust')).toBe('skills/personas/rust-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('rust-reviewer')).toBe('skills/personas/rust-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('go')).toBe('skills/personas/go-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('python')).toBe('skills/personas/python-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('swift')).toBe('skills/personas/swift-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('typescript')).toBe('skills/personas/typescript-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('cpp')).toBe('skills/personas/cpp-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('csharp')).toBe('skills/personas/csharp-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('kotlin')).toBe('skills/personas/kotlin-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('zig')).toBe('skills/personas/zig-reviewer/SKILL.md');
      expect(LanguagePersonaResolver.getPersonaSkillPath('ui-layout')).toBe('skills/personas/ui-layout-reviewer/SKILL.md');
    });

    it('returns absolute or combined skill path with projectRoot', () => {
      const fullPath = LanguagePersonaResolver.getPersonaSkillPath('rust', '/workspace/app');
      expect(fullPath).toBe(path.join('/workspace/app', 'skills/personas/rust-reviewer/SKILL.md'));
    });
  });
});
