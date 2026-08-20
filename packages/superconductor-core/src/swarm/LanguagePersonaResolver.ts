import * as fs from 'fs';
import * as path from 'path';

export type LanguagePersona =
  | 'rust'
  | 'go'
  | 'python'
  | 'swift'
  | 'typescript'
  | 'cpp'
  | 'csharp'
  | 'kotlin'
  | 'zig'
  | 'ui-layout'
  | 'generic'
  | 'rust-reviewer'
  | 'go-reviewer'
  | 'python-reviewer'
  | 'swift-reviewer'
  | 'typescript-reviewer'
  | 'cpp-reviewer'
  | 'csharp-reviewer'
  | 'kotlin-reviewer'
  | 'zig-reviewer'
  | 'ui-layout-reviewer'
  | 'generic-reviewer';

const UI_PACKAGE_DEPENDENCIES = [
  'react',
  'react-dom',
  'vue',
  'svelte',
  'next',
  'nuxt',
  'astro',
  'solid-js',
  '@angular/core',
  'tailwindcss',
  'styled-components',
  '@emotion/react',
  '@emotion/styled',
  'electron',
  '@tauri-apps/api',
  'react-native',
  'expo',
  '@remix-run/react',
  '@sveltejs/kit'
];

export class LanguagePersonaResolver {
  /**
   * Normalizes a persona identifier to canonical short form (e.g. 'rust-reviewer' -> 'rust').
   */
  static canonicalize(persona: string): LanguagePersona {
    const p = persona.toLowerCase().replace(/-reviewer$/, '');
    switch (p) {
      case 'rust':
      case 'go':
      case 'python':
      case 'swift':
      case 'typescript':
      case 'cpp':
      case 'csharp':
      case 'kotlin':
      case 'zig':
      case 'ui-layout':
        return p as LanguagePersona;
      case 'ts':
      case 'js':
      case 'javascript':
        return 'typescript';
      case 'c++':
      case 'cxx':
        return 'cpp';
      case 'c#':
      case 'cs':
      case 'dotnet':
        return 'csharp';
      case 'kt':
        return 'kotlin';
      case 'ui':
      case 'layout':
      case 'frontend':
        return 'ui-layout';
      default:
        return 'generic';
    }
  }

  /**
   * Resolves the relative or absolute path to a persona skill SKILL.md file.
   */
  static getPersonaSkillPath(persona: LanguagePersona | string, projectRoot?: string): string {
    const canonical = this.canonicalize(persona);
    const folderName = canonical === 'generic' ? 'generic-reviewer' : `${canonical}-reviewer`;
    const relativePath = path.join('skills', 'personas', folderName, 'SKILL.md');
    
    if (projectRoot) {
      return path.join(projectRoot, relativePath);
    }
    return relativePath;
  }

  /**
   * Resolves active language personas from a project root directory.
   */
  static resolveFromProject(projectRoot: string): LanguagePersona[] {
    const detected = new Set<LanguagePersona>();

    // 1. Inspect tech-stack.md if present
    const techStackPaths = [
      path.join(projectRoot, 'tech-stack.md'),
      path.join(projectRoot, 'superconductor', 'tech-stack.md')
    ];

    let techStackContent = '';
    for (const tsp of techStackPaths) {
      if (fs.existsSync(tsp)) {
        try {
          techStackContent += '\n' + fs.readFileSync(tsp, 'utf8');
        } catch {
          // ignore read error
        }
      }
    }

    if (techStackContent.length > 0) {
      const lower = techStackContent.toLowerCase();

      if (/\b(rust|cargo)\b/i.test(lower)) detected.add('rust');
      if (/\b(golang|go\s+lang|go\s+1\.\d+)\b/i.test(lower) || /(?:language|lang):\s*go\b/i.test(lower) || /\bgo\b/i.test(lower)) detected.add('go');
      if (/\b(python|pyproject|pytest|mypy|django|fastapi|flask)\b/i.test(lower)) detected.add('python');
      if (/\b(swift|swiftui|cocoapods|spm|xcuitest)\b/i.test(lower)) detected.add('swift');
      if (/\b(typescript|javascript|nodejs|node\.js|ts-node|deno|bun)\b/i.test(lower)) detected.add('typescript');
      if (/\b(c\+\+|cpp|cxx|cmake|clang|gcc)\b/i.test(lower)) detected.add('cpp');
      if (/\b(c#|csharp|\.net|dotnet|asp\.net|nuget)\b/i.test(lower)) detected.add('csharp');
      if (/\b(kotlin|compose-multiplatform|jetpack\s+compose|gradle)\b/i.test(lower)) detected.add('kotlin');
      if (/\b(zig|ziglang)\b/i.test(lower)) detected.add('zig');
      if (/\b(react|vue|svelte|swiftui|compose|jetpack\s+compose|flutter|slint|iced|tauri|qt|qml|fyne|tailwind|next\.js|nuxt|astro|remix|solid-js|ui\s+layout|frontend|front-end)\b/i.test(lower)) {
        detected.add('ui-layout');
      }
    }

    // 2. Inspect manifest files and directory entries
    try {
      if (fs.existsSync(projectRoot)) {
        const rootEntries = fs.readdirSync(projectRoot);

        // Rust
        if (rootEntries.includes('Cargo.toml') || rootEntries.includes('Cargo.lock')) {
          detected.add('rust');
          const cargoPath = path.join(projectRoot, 'Cargo.toml');
          if (fs.existsSync(cargoPath)) {
            try {
              const cargoContent = fs.readFileSync(cargoPath, 'utf8').toLowerCase();
              if (cargoContent.includes('slint') || cargoContent.includes('iced') || cargoContent.includes('tauri')) {
                detected.add('ui-layout');
              }
            } catch {
              // ignore
            }
          }
        }

        // Go
        if (rootEntries.includes('go.mod') || rootEntries.includes('go.sum')) {
          detected.add('go');
        }

        // Python
        if (
          rootEntries.includes('pyproject.toml') ||
          rootEntries.includes('requirements.txt') ||
          rootEntries.includes('Pipfile') ||
          rootEntries.includes('setup.py') ||
          rootEntries.includes('setup.cfg') ||
          rootEntries.includes('poetry.lock')
        ) {
          detected.add('python');
        }

        // Swift
        if (
          rootEntries.includes('Package.swift') ||
          rootEntries.includes('Podfile') ||
          rootEntries.includes('Cartfile') ||
          rootEntries.some(e => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace'))
        ) {
          detected.add('swift');
        }

        // TypeScript / JavaScript
        if (
          rootEntries.includes('package.json') ||
          rootEntries.includes('tsconfig.json') ||
          rootEntries.includes('deno.json') ||
          rootEntries.includes('deno.jsonc') ||
          rootEntries.includes('bun.lockb')
        ) {
          detected.add('typescript');

          const pkgPath = path.join(projectRoot, 'package.json');
          if (fs.existsSync(pkgPath)) {
            try {
              const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              const allDeps = {
                ...pkgJson.dependencies,
                ...pkgJson.devDependencies,
                ...pkgJson.peerDependencies
              };
              for (const dep of UI_PACKAGE_DEPENDENCIES) {
                if (dep in allDeps || Object.keys(allDeps).some(d => d.startsWith(dep + '/') || d === dep)) {
                  detected.add('ui-layout');
                  break;
                }
              }
            } catch {
              // ignore JSON parse error
            }
          }
        }

        // C++
        if (
          rootEntries.includes('CMakeLists.txt') ||
          rootEntries.includes('Makefile') ||
          rootEntries.includes('meson.build') ||
          rootEntries.includes('conanfile.txt') ||
          rootEntries.includes('vcpkg.json')
        ) {
          detected.add('cpp');

          const cmakePath = path.join(projectRoot, 'CMakeLists.txt');
          if (fs.existsSync(cmakePath)) {
            try {
              const cmakeContent = fs.readFileSync(cmakePath, 'utf8');
              if (/Qt[56]|find_package\(Qt|QML/i.test(cmakeContent)) {
                detected.add('ui-layout');
              }
            } catch {
              // ignore
            }
          }
        }

        // C#
        if (
          rootEntries.includes('Directory.Build.props') ||
          rootEntries.some(e => e.endsWith('.csproj') || e.endsWith('.sln') || e.endsWith('.fsproj'))
        ) {
          detected.add('csharp');
        }

        // Kotlin
        if (
          rootEntries.includes('build.gradle.kts') ||
          rootEntries.includes('build.gradle') ||
          rootEntries.includes('settings.gradle.kts') ||
          rootEntries.includes('settings.gradle')
        ) {
          detected.add('kotlin');

          for (const gradleFile of ['build.gradle.kts', 'build.gradle']) {
            const gradlePath = path.join(projectRoot, gradleFile);
            if (fs.existsSync(gradlePath)) {
              try {
                const content = fs.readFileSync(gradlePath, 'utf8');
                if (/compose/i.test(content)) {
                  detected.add('ui-layout');
                  break;
                }
              } catch {
                // ignore
              }
            }
          }
        }

        // Zig
        if (rootEntries.includes('build.zig') || rootEntries.includes('build.zig.zon')) {
          detected.add('zig');
        }

        // Flutter
        if (rootEntries.includes('pubspec.yaml')) {
          detected.add('ui-layout');
        }
      }
    } catch {
      // directory read failure
    }

    if (detected.size === 0) {
      return ['generic'];
    }

    return Array.from(detected);
  }

  /**
   * Resolves language personas from a list of modified/changed file paths in a diff.
   */
  static resolveFromDiff(changedFiles: string[], projectRoot?: string): LanguagePersona[] {
    const detected = new Set<LanguagePersona>();

    for (const file of changedFiles) {
      const lower = file.toLowerCase();
      const ext = path.extname(lower);
      const base = path.basename(lower);

      // Manifest and special files
      if (base === 'cargo.toml' || base === 'cargo.lock') detected.add('rust');
      if (base === 'go.mod' || base === 'go.sum') detected.add('go');
      if (base === 'pyproject.toml' || base === 'requirements.txt' || base === 'pipfile' || base === 'setup.py' || base === 'poetry.lock') detected.add('python');
      if (base === 'package.swift' || base === 'podfile' || base === 'cartfile' || base.endsWith('.xcodeproj') || base.endsWith('.xcworkspace')) detected.add('swift');
      if (base === 'package.json' || base === 'tsconfig.json' || base === 'deno.json' || base === 'deno.jsonc' || base === 'yarn.lock' || base === 'pnpm-lock.yaml') detected.add('typescript');
      if (base === 'cmakelists.txt' || base === 'makefile' || base === 'meson.build' || base === 'vcpkg.json') detected.add('cpp');
      if (base.endsWith('.csproj') || base.endsWith('.sln') || base.endsWith('.fsproj') || base === 'directory.build.props') detected.add('csharp');
      if (base === 'build.gradle.kts' || base === 'build.gradle' || base === 'settings.gradle.kts') detected.add('kotlin');
      if (base === 'build.zig' || base === 'build.zig.zon') detected.add('zig');
      if (base === 'pubspec.yaml') detected.add('ui-layout');

      // Extension mappings
      switch (ext) {
        case '.rs':
          detected.add('rust');
          break;
        case '.go':
          detected.add('go');
          break;
        case '.py':
        case '.pyi':
          detected.add('python');
          break;
        case '.swift':
          detected.add('swift');
          if (lower.includes('view') || lower.includes('screen') || lower.includes('ui')) {
            detected.add('ui-layout');
          }
          break;
        case '.ts':
        case '.js':
        case '.mjs':
        case '.cjs':
          detected.add('typescript');
          break;
        case '.tsx':
        case '.jsx':
        case '.vue':
        case '.svelte':
          detected.add('typescript');
          detected.add('ui-layout');
          break;
        case '.cpp':
        case '.cc':
        case '.cxx':
        case '.c':
        case '.hpp':
        case '.h':
        case '.hxx':
          detected.add('cpp');
          break;
        case '.cs':
        case '.csx':
          detected.add('csharp');
          break;
        case '.kt':
        case '.kts':
          detected.add('kotlin');
          if (lower.includes('screen') || lower.includes('component') || lower.includes('view')) {
            detected.add('ui-layout');
          }
          break;
        case '.zig':
        case '.zon':
          detected.add('zig');
          break;
        case '.slint':
        case '.qml':
        case '.ui':
        case '.html':
        case '.css':
        case '.scss':
        case '.sass':
        case '.less':
        case '.xcstrings':
          detected.add('ui-layout');
          break;
      }
    }

    if (detected.size === 0) {
      if (projectRoot && fs.existsSync(projectRoot)) {
        return this.resolveFromProject(projectRoot);
      }
      return ['generic'];
    }

    return Array.from(detected);
  }
}
