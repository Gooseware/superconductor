import { LanguageAdapter, LanguageProfile } from './LanguageAdapter';
import { ANTI_PATTERNS } from './anti-patterns';

export class RemediatorPromptBuilder {
    build(taskInfo: { task: string, scope: string, excluded: string, pattern: string, evidenceRequired: string, definitionOfDone: string }, workspacePath: string, language: string): string {
        const profile = LanguageAdapter.detectProfile(workspacePath);
        const antiPatternsList = profile.testTheatreAntiPatterns && profile.testTheatreAntiPatterns.length > 0 ? profile.testTheatreAntiPatterns : (ANTI_PATTERNS[language]?.adversarial || []);
        
        return `
TASK: ${taskInfo.task}
SCOPE: ${taskInfo.scope} (Manifests: ${profile.manifestFiles.join(', ')})
EXCLUDED: ${taskInfo.excluded} (Generated: ${profile.generatedDirs.join(', ')})
PATTERN: ${taskInfo.pattern}
ANTI_PATTERNS: ${antiPatternsList.join(', ')}
EVIDENCE_REQUIRED: ${taskInfo.evidenceRequired} (Test Command: ${profile.testCommand})
DEFINITION_OF_DONE: ${taskInfo.definitionOfDone}
`.trim();
    }
}
