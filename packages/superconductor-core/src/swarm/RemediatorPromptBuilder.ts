import { LanguageAdapter, LanguageProfile } from './LanguageAdapter';
import { ANTI_PATTERNS } from './anti-patterns';

export class RemediatorPromptBuilder {
    build(taskInfo: { task: string, scope: string, excluded: string, pattern: string, evidenceRequired: string, definitionOfDone: string }, workspacePath: string, language: string): string {
        const profile = LanguageAdapter.detectProfile(workspacePath);
        const antiPatternsList = ANTI_PATTERNS[language]?.adversarial || [];
        
        return `
TASK: ${taskInfo.task}
SCOPE: ${taskInfo.scope}
EXCLUDED: ${taskInfo.excluded}
PATTERN: ${taskInfo.pattern}
ANTI_PATTERNS: ${antiPatternsList.join(', ')}
EVIDENCE_REQUIRED: ${taskInfo.evidenceRequired}
DEFINITION_OF_DONE: ${taskInfo.definitionOfDone}
`;
    }
}
