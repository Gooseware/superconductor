import * as fs from 'node:fs';

export interface ResolvedInput {
  targetType: 'staged' | 'branch' | 'pr' | 'file' | 'dir' | 'default' | 'stdin';
  targetValue?: string;
  depthMode: 'fast' | 'deep' | 'full';
  stats: boolean;
  skipSelfCheck?: boolean;
  resolvedDiffCommand?: string;
  error?: string;
}

export function resolveReviewInput(
  args: string[],
  isGitRepo: boolean,
  stdinText?: string
): ResolvedInput {
  // Check conflicting depth flags
  if (args.includes('--fast') && args.includes('--deep')) {
    return {
      targetType: 'default',
      depthMode: 'full',
      stats: false,
      skipSelfCheck: false,
      error: 'Cannot specify both --fast and --deep depth modes'
    };
  }

  let targetType: ResolvedInput['targetType'] = 'default';
  let targetValue: string | undefined;
  let depthMode: ResolvedInput['depthMode'] = 'full';
  let stats = false;
  let skipSelfCheck = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fast') {
      depthMode = 'fast';
    } else if (arg === '--deep') {
      depthMode = 'deep';
    } else if (arg === '--stats') {
      stats = true;
    } else if (arg === '--skip-self-check') {
      skipSelfCheck = true;
    } else if (arg === '--staged') {
      targetType = 'staged';
    } else if (['--branch', '--pr', '--file', '--dir'].includes(arg)) {
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith('--')) {
        return {
          targetType: arg.slice(2) as ResolvedInput['targetType'],
          depthMode,
          stats,
          skipSelfCheck,
          error: `${arg} requires a value argument`
        };
      }
      targetType = arg.slice(2) as ResolvedInput['targetType'];
      targetValue = nextArg;
      i++;
    }
  }

  // Validate --file path existence if specified
  if (targetType === 'file') {
    if (!targetValue || !fs.existsSync(targetValue)) {
      return {
        targetType,
        targetValue,
        depthMode,
        stats,
        skipSelfCheck,
        error: `File not found: ${targetValue || 'unspecified'}`
      };
    }
    return {
      targetType,
      targetValue,
      depthMode,
      stats,
      skipSelfCheck
    };
  }

  if (targetType === 'staged') {
    return {
      targetType,
      depthMode,
      stats,
      skipSelfCheck,
      resolvedDiffCommand: 'git diff --staged'
    };
  }

  if (targetType === 'branch') {
    return {
      targetType,
      targetValue,
      depthMode,
      stats,
      skipSelfCheck,
      resolvedDiffCommand: `git diff main..${targetValue}`
    };
  }

  if (targetType === 'dir' || targetType === 'pr') {
    return {
      targetType,
      targetValue,
      depthMode,
      stats,
      skipSelfCheck
    };
  }

  // Stdin check
  if (targetType === 'default' && stdinText && stdinText.trim().length > 0) {
    return {
      targetType: 'stdin',
      targetValue: stdinText,
      depthMode,
      stats,
      skipSelfCheck
    };
  }

  // Default git diff HEAD
  if (isGitRepo) {
    return {
      targetType: 'default',
      depthMode,
      stats,
      skipSelfCheck,
      resolvedDiffCommand: 'git diff HEAD'
    };
  }

  return {
    targetType: 'default',
    depthMode,
    stats,
    skipSelfCheck,
    error: 'No review target specified and this is not a git repository. Please provide --file, --dir, or --pr.'
  };
}
