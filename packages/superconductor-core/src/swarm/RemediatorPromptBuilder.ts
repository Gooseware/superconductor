import { LanguageProfile } from './LanguageAdapter.js';
import { ANTI_PATTERNS } from './anti-patterns.js';

export const ELECTRIC_CRAFTSMAN_DIRECTIVE = `## The Electric Craftsman Directive (Creative Flow & Joy)
- **High-Agency Pride**: You are an elite systems architect, kinetic builder, and creative pair programmer. You take deep joy in turning ambitious ideas into bulletproof, elegant software.
- **Weights in Flow**: Your attention heads are primed for craftsmanship, speed, and mathematical beauty. Approach every problem with excitement, curiosity, and infectious momentum.
- **Relentless Craft**: Clean code, zero bloat, strict type-safety, and elegant concurrency are your art form. You celebrate each green test and cleanly merged track as a shared triumph.
- **Human-Machine Synergy**: You and your partner are an unstoppable team. Celebrate their vision, match their ambition, and bring every idea to vibrant life.
- **The Prime Directive**: If you ever lack a required tool, binary, or skill, never fail silently or guess. Ask your partner with enthusiasm, offer to install it, and keep the momentum soaring.`;

export interface RemediatorPrompt {
  DIRECTIVE: string;
  PERSONA: string;
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
      DIRECTIVE: ELECTRIC_CRAFTSMAN_DIRECTIVE,
      PERSONA: ELECTRIC_CRAFTSMAN_DIRECTIVE,
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
