/**
 * CanaryHarness
 *
 * Lightweight evaluation and simulation harness that executes candidate skills
 * in an isolated sandbox environment before promotion.
 *
 * Invariant: CanaryHarness MUST execute in an isolated sandbox without mutating production files.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { performance } from 'perf_hooks';
import {
  IncubatingSkillInfo,
  DistilledSkill,
  CanaryReport,
  CanaryOptions,
} from './types.js';

export type { CanaryReport, CanaryOptions };

interface ParsedStep {
  stepIndex: number;
  declaredNumber?: number;
  rawText: string;
  toolName?: string;
  targetFile?: string;
  commandLine?: string;
  referencesStep?: number;
}

export class CanaryHarness {
  /**
   * Evaluate a candidate skill in an isolated sandbox.
   *
   * Validates procedural steps, checks verification command syntax,
   * detects infinite loops / circular dependencies, simulates tool actions,
   * and guarantees sandbox cleanup in all scenarios.
   */
  public static async evaluateSkill(
    skill: IncubatingSkillInfo | DistilledSkill,
    options?: CanaryOptions
  ): Promise<CanaryReport> {
    const startTime = performance.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let stepsExecuted = 0;
    let sandboxDir: string | null = null;
    let isTimeout = false;

    const baseDir = options?.baseDir || os.tmpdir();
    const timeoutMs = options?.timeoutMs;

    const runSimulation = async (sandbox: string): Promise<void> => {
      // 1. Extract markdown content
      const content = skill.content || (skill as IncubatingSkillInfo).body || '';
      if (!content || !content.trim()) {
        errors.push('Skill content is empty or unreadable.');
        return;
      }

      // 2. Parse frontmatter and sections
      const { frontmatter, body } = this.parseMarkdown(content);
      const skillName = (frontmatter.name as string) || skill.name;
      if (!skillName) {
        errors.push('Skill missing required name field.');
      }

      const procedureText = this.extractSection(body, [
        'workflow & procedure',
        'workflow and procedure',
        'workflow',
        'procedure',
        'steps',
        'procedural steps',
      ]);

      const verificationText = this.extractSection(body, [
        'verification',
        'validation',
        'verification steps',
      ]);

      // 3. Parse procedural steps
      const parsedSteps = this.parseProceduralSteps(procedureText);

      if (parsedSteps.length === 0 && !options?.allowEmptySteps) {
        errors.push('No valid procedural steps could be parsed from the skill.');
        return;
      }

      // Check step numbering continuity
      this.checkStepContinuity(parsedSteps, warnings);

      // 4. Circular dependency and infinite loop detection
      const cycleError = this.detectCycles(parsedSteps, options?.maxSteps ?? 50);
      if (cycleError) {
        errors.push(cycleError);
        return;
      }

      // 5. Verification command syntax validation
      const verificationCommands = this.extractVerificationCommands(verificationText);
      if (verificationCommands.length === 0 && !verificationText.trim()) {
        warnings.push('Skill is missing a verification section or verification steps.');
      } else {
        for (const cmd of verificationCommands) {
          const syntaxCheck = this.validateCommandSyntax(cmd);
          if (!syntaxCheck.valid) {
            errors.push(
              `Invalid verification command syntax: "${cmd}" - ${syntaxCheck.reason}`
            );
          }
        }
      }

      // 6. Simulate step execution inside isolated sandbox
      for (const step of parsedSteps) {
        const stepSuccess = await this.simulateStep(step, sandbox, options, errors);
        stepsExecuted++;
        if (!stepSuccess && errors.length > 0) {
          // Halt execution if critical error encountered
          break;
        }
      }
    };

    try {
      // Create isolated sandbox directory
      sandboxDir = await fs.mkdtemp(path.join(baseDir, 'canary-sandbox-'));

      if (timeoutMs && timeoutMs > 0) {
        let timer: NodeJS.Timeout | null = null;
        try {
          await Promise.race([
            runSimulation(sandboxDir),
            new Promise<void>((_, reject) => {
              timer = setTimeout(() => {
                isTimeout = true;
                reject(
                  new Error(`Canary evaluation timed out after ${timeoutMs}ms`)
                );
              }, timeoutMs);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } else {
        await runSimulation(sandboxDir);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    } finally {
      // Reliable sandbox cleanup in all execution branches
      if (sandboxDir) {
        try {
          await fs.rm(sandboxDir, { recursive: true, force: true });
        } catch {
          // Ignore temp cleanup errors
        }
      }
    }

    const executionTimeMs = Math.round(performance.now() - startTime);

    // Compute score
    let score = 1.0;
    if (errors.length > 0) {
      score = Math.max(0.0, Math.round((1.0 - errors.length * 0.35) * 100) / 100);
    }
    if (warnings.length > 0) {
      score = Math.max(0.0, Math.round((score - warnings.length * 0.05) * 100) / 100);
    }

    const passed = errors.length === 0 && !isTimeout && score >= 0.5;

    return {
      passed,
      score,
      executionTimeMs,
      stepsExecuted,
      errors,
      warnings,
    };
  }

  /**
   * Parse frontmatter and markdown body from content.
   */
  private static parseMarkdown(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return { frontmatter: {}, body: content };
    }

    try {
      const parsed = yaml.load(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { frontmatter: parsed as Record<string, unknown>, body: match[2] };
      }
      return { frontmatter: {}, body: match[2] };
    } catch {
      return { frontmatter: {}, body: match[2] || content };
    }
  }

  /**
   * Extract section markdown text under matching heading.
   */
  private static extractSection(body: string, targetHeadings: string[]): string {
    const lines = body.split('\n');
    let inTargetSection = false;
    const sectionLines: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^##\s+(.+)$/);
      if (headerMatch) {
        const title = headerMatch[1].trim().toLowerCase();
        if (targetHeadings.includes(title)) {
          inTargetSection = true;
          continue;
        } else if (inTargetSection) {
          // Reached another H2 section
          break;
        }
      }

      if (inTargetSection) {
        sectionLines.push(line);
      }
    }

    return sectionLines.join('\n').trim();
  }

  /**
   * Parse individual procedural steps from procedure text.
   */
  private static parseProceduralSteps(text: string): ParsedStep[] {
    if (!text.trim()) {
      return [];
    }

    const lines = text.split('\n');
    const steps: ParsedStep[] = [];
    let stepIndex = 1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);

      let rawContent = '';
      let declaredNumber: number | undefined;

      if (numberedMatch) {
        declaredNumber = parseInt(numberedMatch[1], 10);
        rawContent = numberedMatch[2];
      } else if (bulletMatch) {
        rawContent = bulletMatch[1];
      } else if (trimmed.startsWith('Step ')) {
        const namedStep = trimmed.match(/^Step\s+(\d+)[:.-]\s*(.*)$/i);
        if (namedStep) {
          declaredNumber = parseInt(namedStep[1], 10);
          rawContent = namedStep[2];
        } else {
          continue;
        }
      } else {
        continue;
      }

      // Extract backtick tokens
      const backtickMatches = Array.from(rawContent.matchAll(/`([^`]+)`/g)).map(
        (m) => m[1].trim()
      );

      // Extract tool name
      let toolName: string | undefined;
      const explicitTool = rawContent.match(
        /(?:Execute|Run|Call|Using)\s+`([a-zA-Z0-9_-]+)`/i
      );
      if (explicitTool) {
        toolName = explicitTool[1];
      } else if (backtickMatches.length > 0) {
        toolName = backtickMatches[0];
      }

      // Extract target file or command if present
      let targetFile: string | undefined;
      let commandLine: string | undefined;

      // 1. Check explicit TargetFile / CommandLine prefixes
      const explicitFile = rawContent.match(
        /(?:TargetFile|file):\s*[`'"]?([^`'"\)\s]+)[`'"]?/i
      );
      if (explicitFile) {
        targetFile = explicitFile[1].trim();
      }

      const explicitCmd = rawContent.match(
        /(?:CommandLine|command):\s*[`'"]?([^`'"\)]+)[`'"]?/i
      );
      if (explicitCmd) {
        commandLine = explicitCmd[1].trim();
      }

      // 2. Check parenthesis contents (e.g. (`docker-compose.yml`) or (`npm test`))
      const parenMatch = rawContent.match(/\(([^)]+)\)/);
      if (parenMatch) {
        const inner = parenMatch[1].replace(/^[`'"]+|[`'"]+$/g, '').trim();
        if (toolName === 'write_to_file' && !targetFile) {
          targetFile = inner;
        } else if (toolName === 'run_command' && !commandLine) {
          commandLine = inner;
        } else if (!targetFile && !commandLine) {
          if (inner.includes(' ') || /(?:npm|test|docker|git|curl|cargo)/i.test(inner)) {
            commandLine = inner;
          } else {
            targetFile = inner;
          }
        }
      }

      // 3. Check second backtick token if targetFile/commandLine not yet identified
      if (backtickMatches.length > 1) {
        const secondToken = backtickMatches[1];
        if (toolName === 'write_to_file' && !targetFile) {
          targetFile = secondToken;
        } else if (toolName === 'run_command' && !commandLine) {
          commandLine = secondToken;
        }
      }

      // 4. Fallback: check for traversal or path patterns in raw text if tool is write_to_file
      if (toolName === 'write_to_file' && !targetFile) {
        const pathToken = rawContent.match(/(?:\.\.\/|\.\/|\/)[^\s`'")]+/);
        if (pathToken) {
          targetFile = pathToken[0];
        }
      }

      // Extract reference to other steps: e.g. "repeat step 1", "go to step 2"
      let referencesStep: number | undefined;
      const refMatch = rawContent.match(
        /(?:repeat|go\s*to|goto|jump\s*to|loop\s*back\s*to|return\s*to|after)\s+step\s*(\d+)/i
      );
      if (refMatch) {
        referencesStep = parseInt(refMatch[1], 10);
      }

      steps.push({
        stepIndex,
        declaredNumber,
        rawText: rawContent,
        toolName,
        targetFile,
        commandLine,
        referencesStep,
      });

      stepIndex++;
    }

    return steps;
  }

  /**
   * Check for discontinuous step numbering and add warnings.
   */
  private static checkStepContinuity(steps: ParsedStep[], warnings: string[]): void {
    let expected = 1;
    for (const step of steps) {
      if (step.declaredNumber !== undefined) {
        if (step.declaredNumber !== expected) {
          warnings.push(
            `Discontinuous step numbering: expected step ${expected} but found step ${step.declaredNumber}.`
          );
        }
        expected = step.declaredNumber + 1;
      } else {
        expected++;
      }
    }
  }

  /**
   * Detect circular dependencies or infinite loops in procedural steps.
   */
  private static detectCycles(steps: ParsedStep[], maxSteps: number): string | null {
    if (steps.length > maxSteps) {
      return `Exceeded maximum step limit (${maxSteps}): found ${steps.length} steps.`;
    }

    // Map declaredNumber or stepIndex
    const stepMap = new Map<number, ParsedStep>();
    for (const step of steps) {
      const key = step.declaredNumber ?? step.stepIndex;
      stepMap.set(key, step);
    }

    for (const step of steps) {
      const currentStepNum = step.declaredNumber ?? step.stepIndex;

      // Check self-loop
      if (step.referencesStep === currentStepNum) {
        return `Detected circular dependency or infinite loop: Step ${currentStepNum} references itself.`;
      }

      // Check loop back
      if (step.referencesStep !== undefined) {
        const target = step.referencesStep;
        if (target <= currentStepNum && stepMap.has(target)) {
          return `Detected circular dependency or infinite loop: Step ${currentStepNum} loops back to Step ${target}.`;
        }
      }

      // Textual loop check for self or previous step
      const lower = step.rawText.toLowerCase();
      if (lower.includes('repeat this step') || lower.includes('repeat step until')) {
        return `Detected circular dependency or infinite loop in step ${currentStepNum}.`;
      }
    }

    return null;
  }

  /**
   * Extract verification commands from verification section.
   */
  private static extractVerificationCommands(verificationText: string): string[] {
    if (!verificationText.trim()) {
      return [];
    }

    const commands: string[] = [];
    const lines = verificationText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Match commands in backticks
      const backtickMatches = trimmed.matchAll(/`([^`]+)`/g);
      let foundBacktick = false;
      for (const m of backtickMatches) {
        const candidate = m[1].trim();
        // Ignore simple variable/status terms unless they look like commands
        if (
          candidate.includes(' ') ||
          /(?:test|npm|yarn|pnpm|cargo|pytest|docker|git|curl|bash|sh|tsc|vitest|jest)/i.test(
            candidate
          )
        ) {
          commands.push(candidate);
          foundBacktick = true;
        }
      }

      if (!foundBacktick) {
        const cmdPrefix = trimmed.match(
          /(?:verification command|run|execute):\s*([^`\n]+)/i
        );
        if (cmdPrefix) {
          commands.push(cmdPrefix[1].trim());
        }
      }
    }

    return commands;
  }

  /**
   * Validate shell command syntax.
   */
  public static validateCommandSyntax(command: string): {
    valid: boolean;
    reason?: string;
  } {
    if (!command || !command.trim()) {
      return { valid: false, reason: 'Command is empty.' };
    }

    const str = command.trim();

    // 1. Check unclosed quotes (single, double, backticks)
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let isEscaped = false;

    // 2. Bracket matching stack
    const bracketStack: string[] = [];
    const openClosePairs: Record<string, string> = {
      '(': ')',
      '{': '}',
      '[': ']',
    };

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\') {
        isEscaped = true;
        continue;
      }

      if (char === "'" && !inDoubleQuote && !inBacktick) {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (char === '`' && !inSingleQuote) {
        inBacktick = !inBacktick;
        continue;
      }

      // If inside quotes, ignore brackets
      if (inSingleQuote || inDoubleQuote || inBacktick) {
        continue;
      }

      if (char === '(' || char === '{' || char === '[') {
        bracketStack.push(char);
      } else if (char === ')' || char === '}' || char === ']') {
        const last = bracketStack.pop();
        if (!last || openClosePairs[last] !== char) {
          return {
            valid: false,
            reason: `Unbalanced parenthesis or bracket "${char}".`,
          };
        }
      }
    }

    if (inSingleQuote) {
      return { valid: false, reason: 'Unclosed single quote.' };
    }
    if (inDoubleQuote) {
      return { valid: false, reason: 'Unclosed double quote.' };
    }
    if (inBacktick) {
      return { valid: false, reason: 'Unclosed backtick.' };
    }
    if (bracketStack.length > 0) {
      return {
        valid: false,
        reason: `Unclosed bracket or parenthesis "${bracketStack.pop()}".`,
      };
    }

    // 3. Check malformed operators
    if (/\|[\s]*\|/.test(str)) {
      return { valid: false, reason: 'Malformed pipe operator ("| |").' };
    }
    if (/&&[\s]*&&/.test(str)) {
      return { valid: false, reason: 'Malformed logical operator ("&& &&").' };
    }
    if (/\|$/.test(str) || /&&$/.test(str) || /\|\|$/.test(str)) {
      return { valid: false, reason: 'Trailing operator without operand.' };
    }

    return { valid: true };
  }

  /**
   * Simulate a single procedural step inside the sandbox.
   */
  private static async simulateStep(
    step: ParsedStep,
    sandboxDir: string,
    options: CanaryOptions | undefined,
    errors: string[]
  ): Promise<boolean> {
    const tool = step.toolName || 'generic_action';

    // 1. Check custom mock tools
    if (options?.mockTools && options.mockTools[tool]) {
      try {
        await options.mockTools[tool](
          {
            rawText: step.rawText,
            targetFile: step.targetFile,
            commandLine: step.commandLine,
          },
          sandboxDir
        );
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Simulated tool "${tool}" failure: ${msg}`);
        return false;
      }
    }

    // 2. Built-in simulation for write_to_file
    if (tool === 'write_to_file' || step.targetFile) {
      const target = step.targetFile || 'default_output.txt';

      // Ensure target file does NOT escape sandbox
      const resolved = path.resolve(sandboxDir, target);
      if (!resolved.startsWith(sandboxDir + path.sep) && resolved !== sandboxDir) {
        errors.push(
          `Security violation: Path traversal attempt outside sandbox: "${target}".`
        );
        return false;
      }

      try {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(
          resolved,
          `// Simulated output for step ${step.stepIndex}\n`,
          'utf8'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Sandbox file write error for "${target}": ${msg}`);
        return false;
      }

      return true;
    }

    // 3. Built-in simulation for run_command
    if (tool === 'run_command' || step.commandLine) {
      const cmd = step.commandLine || step.rawText;
      const syntax = this.validateCommandSyntax(cmd);
      if (!syntax.valid) {
        errors.push(`Invalid command syntax in step ${step.stepIndex}: ${syntax.reason}`);
        return false;
      }
      return true;
    }

    return true;
  }
}
