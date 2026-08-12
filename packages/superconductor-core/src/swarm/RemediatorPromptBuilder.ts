import { LanguageProfile } from './LanguageAdapter.js';
import { ANTI_PATTERNS } from './anti-patterns.js';

export interface RemediatorPrompt {
  TASK: string;
  SCOPE: string;
  EXCLUDED: string[];
  PATTERN: string[];
  ANTI_PATTERNS: string[];
  EVIDENCE_REQUIRED: string;
  DEFINITION_OF_DONE: string;
}

export class RemediatorPromptBuilder {
  static build(
    profile: LanguageProfile,
    findingCategory: string,
    taskDescription: string,
    scope: string
  ): RemediatorPrompt {
    const defaultExcludes = [
      'plan.md',
      'spec.md',
      'archive/',
      '*.lock',
      '.superconductor/' // intelligence snapshots usually go in .superconductor or similar
    ];
    
    const combinedExcludes = Array.from(new Set([
      ...defaultExcludes,
      ...profile.manifestFiles.filter(f => f.endsWith('.lock') || f.endsWith('.yaml')), // simple heuristic
      ...profile.generatedDirs.map(d => d + '/')
    ]));

    let antiPatternsList: string[] = [];
    if (ANTI_PATTERNS[profile.language] && ANTI_PATTERNS[profile.language][findingCategory]) {
      antiPatternsList = ANTI_PATTERNS[profile.language][findingCategory];
    } else if (ANTI_PATTERNS['unknown'] && ANTI_PATTERNS['unknown'][findingCategory]) {
      antiPatternsList = ANTI_PATTERNS['unknown'][findingCategory];
    }
    
    // Mix in the adversarial ones from the language profile just in case it's a correctness/adversarial thing
    if (findingCategory === 'adversarial' || findingCategory === 'test') {
       antiPatternsList = Array.from(new Set([...antiPatternsList, ...profile.testTheatreAntiPatterns]));
    }

    return {
      TASK: taskDescription,
      SCOPE: scope,
      EXCLUDED: combinedExcludes,
      PATTERN: profile.siblingsWithTests() ? ['**/*.test.*', '**/*.spec.*'] : ['**/*'],
      ANTI_PATTERNS: antiPatternsList,
      EVIDENCE_REQUIRED: `Provide output from running: ${profile.testCommand}`,
      DEFINITION_OF_DONE: `All findings addressed, ${profile.testCommand} passes, no anti-patterns present.`
    };
  }
}
