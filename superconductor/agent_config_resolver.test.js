import { AgentConfigResolver } from './agent_config_resolver.js';

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
  }
}

console.log('--- AgentConfigResolver Unit Tests ---');

test('graceful fallback when neither file exists', () => {
  const mockFs = {
    existsSync: () => false,
    readFileSync: () => ''
  };
  const mockEnv = { HOME: '/home/user' };
  const resolver = new AgentConfigResolver(mockFs, mockEnv);
  const config = resolver.resolveConfig();

  assertEquals(config.tier2, 'gemini-2.0-flash-lite', 'Default tier2');
  assertEquals(config.tier3, 'gemini-2.5-pro', 'Default tier3');
  assertEquals(config.tier4, 'gemini-2.5-pro (thinking)', 'Default tier4');
  assertEquals(config.proxyEndpoint, null, 'Default proxyEndpoint should be null');
});

test('falls back to global when no project config exists', () => {
  const globalPath = '/home/user/.gemini/agent-config.md';
  const mockFs = {
    existsSync: (path) => path === globalPath,
    readFileSync: (path) => {
      if (path === globalPath) {
        return `
# Agent Configuration
- **Tier 2 (Triage):** custom-triage
- **Tier 3 (Standard):** custom-standard
- **Tier 4 (Frontier):** custom-frontier
- **Proxy Endpoint:** https://custom-proxy.com
`;
      }
      return '';
    }
  };
  const mockEnv = { HOME: '/home/user' };
  const resolver = new AgentConfigResolver(mockFs, mockEnv);
  const config = resolver.resolveConfig();

  assertEquals(config.tier2, 'custom-triage', 'Resolved custom-triage from global');
  assertEquals(config.tier3, 'custom-standard', 'Resolved custom-standard from global');
  assertEquals(config.tier4, 'custom-frontier', 'Resolved custom-frontier from global');
  assertEquals(config.proxyEndpoint, 'https://custom-proxy.com', 'Resolved custom-proxy from global');
});

test('project config overrides global when both exist', () => {
  const projectPath = 'superconductor/agent-config.md';
  const globalPath = '/home/user/.gemini/agent-config.md';
  const mockFs = {
    existsSync: (path) => path === projectPath || path === globalPath,
    readFileSync: (path) => {
      if (path === projectPath) {
        return `
# Project Agent Config
- **Tier 2:** project-triage
- **Tier 3:** project-standard
- **Tier 4:** project-frontier
- **Proxy Endpoint:** (none)
`;
      }
      if (path === globalPath) {
        return `
# Global Agent Config
- **Tier 2:** global-triage
- **Tier 3:** global-standard
- **Tier 4:** global-frontier
- **Proxy Endpoint:** https://global-proxy.com
`;
      }
      return '';
    }
  };
  const mockEnv = { HOME: '/home/user' };
  const resolver = new AgentConfigResolver(mockFs, mockEnv);
  const config = resolver.resolveConfig();

  assertEquals(config.tier2, 'project-triage', 'Project override for tier2');
  assertEquals(config.tier3, 'project-standard', 'Project override for tier3');
  assertEquals(config.tier4, 'project-frontier', 'Project override for tier4');
  assertEquals(config.proxyEndpoint, null, 'Project override for proxyEndpoint (none)');
});
