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

console.log('--- ProjectConfigAnalyzer Unit Tests ---');

test('suggestDeploymentCommand identifies commands from package.json', () => {
  const mockFs = {
    readFileSync: (path) => {
      if (path === 'package.json') {
        return JSON.stringify({
          scripts: {
            'deploy:prod': 'npm run build && surge dist',
            'deploy:staging': 'surge dist staging.example.com'
          }
        });
      }
      return '';
    },
    existsSync: (path) => path === 'package.json'
  };

  const analyzer = new ProjectConfigAnalyzer(mockFs);
  analyzer.analyze('tech-stack.md', 'package.json');

  assertEquals(analyzer.suggestDeploymentCommand('main'), 'npm run deploy:prod', 'Should suggest prod deploy for main branch');
  assertEquals(analyzer.suggestDeploymentCommand('dev'), 'npm run deploy:staging', 'Should suggest staging deploy for dev branch');
});

test('analyze parses tech-stack.md for deployment hints', () => {
  const mockFs = {
    readFileSync: (path) => {
      if (path === 'tech-stack.md') {
        return `
# Tech Stack
## Deployment
- Staging: \`npm run push:staging\`
- Production: \`npm run push:prod\`
`;
      }
      return '';
    },
    existsSync: (path) => path === 'tech-stack.md'
  };

  const analyzer = new ProjectConfigAnalyzer(mockFs);
  analyzer.analyze('tech-stack.md', 'package.json');

  assertEquals(analyzer.suggestDeploymentCommand('main'), 'npm run push:prod', 'Should suggest prod deploy from tech-stack.md');
  assertEquals(analyzer.suggestDeploymentCommand('dev'), 'npm run push:staging', 'Should suggest staging deploy from tech-stack.md');
});
