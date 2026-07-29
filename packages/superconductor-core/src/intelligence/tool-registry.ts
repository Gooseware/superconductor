import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

export const CAPABILITY_SLOTS = {
  fingerprint: { preferred: 'tokei', alternatives: ['scc', 'cloc'], cmd: '--output json' },
  dependency_graph: { preferred: 'depcruise', alternatives: ['madge', 'deptry'], cmd: '' },
  complexity: { preferred: 'lizard', alternatives: ['radon', 'scc'], cmd: '-w -f json' },
  coupling: { preferred: 'code-maat', alternatives: ['git-log-raw'], cmd: '', builtin_fallback: 'git-log-raw' },
  sast: { preferred: 'semgrep', alternatives: ['eslint'], cmd: '--json' },
  sca: { preferred: 'trivy', alternatives: ['grype'], cmd: 'fs' },
  symbol_extraction: { preferred: 'tree-sitter-analyzer', alternatives: ['ctags'], cmd: '' },
  test_gaps: { preferred: 'static-test-gap-analyzer', alternatives: [], cmd: '', builtin: true },
};

export interface ToolCapability {
  tool: string | null;
  version: string | null;
  status: 'available' | 'degraded' | 'unavailable';
}

export interface ToolRegistry {
  verified_at: number;
  capabilities: Record<string, ToolCapability>;
}

export function getSuperconductorHome(): string {
  return path.resolve(
    process.env.SUPERCONDUCTOR_HOME || path.join(os.homedir(), '.superconductor')
  );
}

export function ensureHomeDir(home: string) {
  const dirs = ['bin', 'semgrep-rules', 'trivy-db'];
  if (!fs.existsSync(home)) {
    fs.mkdirSync(home, { recursive: true });
  }
  for (const d of dirs) {
    const p = path.join(home, d);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
}

export function verifyTool(name: string, p: string = name): { ok: boolean; version: string | null } {
  try {
    const cmd = `${p} --version`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { ok: true, version: out.split('\n')[0].substring(0, 50) };
  } catch (e) {
    return { ok: false, version: null };
  }
}

export function discoverCapability(slotKey: string, slotConfig: any, home: string): ToolCapability {
  if (slotConfig.builtin) {
    return { tool: slotConfig.preferred, version: 'builtin', status: 'available' };
  }
  const toolsToTry = [slotConfig.preferred, ...slotConfig.alternatives];
  for (const tool of toolsToTry) {
    if (tool === 'git-log-raw') {
      return { tool: 'git-log-raw', version: 'builtin', status: 'degraded' };
    }
    const res = verifyTool(tool);
    if (res.ok) {
      return { tool, version: res.version, status: tool === slotConfig.preferred ? 'available' : 'degraded' };
    }
    // Also try in home bin
    const binPath = path.join(home, 'bin', tool);
    if (fs.existsSync(binPath)) {
      const resBin = verifyTool(tool, binPath);
      if (resBin.ok) {
        return { tool, version: resBin.version, status: tool === slotConfig.preferred ? 'available' : 'degraded' };
      }
    }
  }
  if (slotConfig.builtin_fallback) {
    return { tool: slotConfig.builtin_fallback, version: 'builtin', status: 'degraded' };
  }
  return { tool: null, version: null, status: 'unavailable' };
}

export function setupRegistry(home: string): ToolRegistry {
  ensureHomeDir(home);
  const registry: ToolRegistry = {
    verified_at: Date.now(),
    capabilities: {},
  };
  console.log('Discovering tool capabilities...');
  for (const [key, slot] of Object.entries(CAPABILITY_SLOTS)) {
    const cap = discoverCapability(key, slot, home);
    registry.capabilities[key] = cap;
    const icon = cap.status === 'available' ? '✅' : cap.status === 'degraded' ? '⚠️' : '❌';
    console.log(`${icon} ${key}: ${cap.tool || 'none'} (${cap.status})`);
    if (cap.status === 'unavailable') {
      console.log(`   💡 Install ${slot.preferred} to enable this capability.`);
    }
  }
  fs.writeFileSync(path.join(home, 'tool-registry.json'), JSON.stringify(registry, null, 2));
  return registry;
}

export function quickVerify(registry: ToolRegistry, home: string): ToolRegistry {
  let needsUpdate = false;
  for (const [key, cap] of Object.entries(registry.capabilities)) {
    if (cap.status === 'unavailable' || cap.version === 'builtin') continue;
    if (cap.tool) {
      const res = verifyTool(cap.tool);
      if (!res.ok) {
        // self heal check
        const binPath = path.join(home, 'bin', cap.tool);
        if (fs.existsSync(binPath)) {
          const resBin = verifyTool(cap.tool, binPath);
          if (!resBin.ok) {
            cap.status = 'unavailable';
            needsUpdate = true;
          }
        } else {
          cap.status = 'unavailable';
          needsUpdate = true;
        }
      }
    }
  }
  if (needsUpdate) {
    registry.verified_at = Date.now();
    fs.writeFileSync(path.join(home, 'tool-registry.json'), JSON.stringify(registry, null, 2));
  }
  return registry;
}

export function isStale(registry: ToolRegistry): boolean {
  const age = Date.now() - registry.verified_at;
  return age > 7 * 24 * 60 * 60 * 1000;
}

export function resolveRegistry(home: string, flags: { reset?: boolean } = {}): ToolRegistry {
  ensureHomeDir(home);
  const regPath = path.join(home, 'tool-registry.json');
  if (flags.reset || !fs.existsSync(regPath)) {
    return setupRegistry(home);
  }
  try {
    const registry = JSON.parse(fs.readFileSync(regPath, 'utf8')) as ToolRegistry;
    if (isStale(registry)) {
      return setupRegistry(home);
    }
    return quickVerify(registry, home);
  } catch (e) {
    return setupRegistry(home);
  }
}
