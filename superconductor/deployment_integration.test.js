import { ProjectConfigAnalyzer } from './project_config_analyzer.js';

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
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

console.log('--- Deployment Integration Unit Tests ---');

test('lifecycle integration suggests correct deployment for target', () => {
  const mockFs = {
    readFileSync: (path) => {
      if (path === 'package.json') return JSON.stringify({ scripts: { 'deploy:prod': 'echo deploy' } });
      if (path === 'superconductor/tech-stack.md') return 'Production: `npm run deploy:prod`';
      return '';
    },
    existsSync: (path) => true
  };

  const analyzer = new ProjectConfigAnalyzer(mockFs);
  analyzer.analyze('superconductor/tech-stack.md', 'package.json');
  
  const suggestion = analyzer.suggestDeploymentCommand('main');
  assertEquals(suggestion, 'npm run deploy:prod', 'Should suggest prod deploy for main');
});
