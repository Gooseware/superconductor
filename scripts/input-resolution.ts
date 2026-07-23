import * as fs from 'fs';

export interface ResolvedInput {
  targetType: 'staged' | 'branch' | 'pr' | 'file' | 'dir' | 'default' | 'stdin';
  targetValue?: string;
  depthMode: 'fast' | 'deep' | 'full';
  stats: boolean;
  resolvedDiffCommand?: string;
  error?: string;
}

export function resolveReviewInput(
  args: string[],
  isGitRepo: boolean,
  stdinText?: string
): ResolvedInput {
  let targetType: ResolvedInput['targetType'] = 'default';
  let targetValue: string | undefined;
  let depthMode: ResolvedInput['depthMode'] = 'full';
  let stats = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fast') {
      depthMode = 'fast';
    } else if (arg === '--deep') {
      depthMode = 'deep';
    } else if (arg === '--stats') {
      stats = true;
    } else if (arg === '--staged') {
      targetType = 'staged';
    } else if (arg === '--branch' && args[i + 1]) {
      targetType = 'branch';
      targetValue = args[++i];
    } else if (arg === '--pr' && args[i + 1]) {
      targetType = 'pr';
      targetValue = args[++i];
    } else if (arg === '--file' && args[i + 1]) {
      targetType = 'file';
      targetValue = args[++i];
    } else if (arg === '--dir' && args[i + 1]) {
      targetType = 'dir';
      targetValue = args[++i];
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
        error: `File not found: ${targetValue || 'unspecified'}`
      };
    }
    return {
      targetType,
      targetValue,
      depthMode,
      stats
    };
  }

  if (targetType === 'staged') {
    return {
      targetType,
      depthMode,
      stats,
      resolvedDiffCommand: 'git diff --staged'
    };
  }

  if (targetType === 'branch') {
    return {
      targetType,
      targetValue,
      depthMode,
      stats,
      resolvedDiffCommand: `git diff main..${targetValue}`
    };
  }

  if (targetType === 'dir' || targetType === 'pr') {
    return {
      targetType,
      targetValue,
      depthMode,
      stats
    };
  }

  // Stdin check
  if (targetType === 'default' && stdinText && stdinText.trim().length > 0) {
    return {
      targetType: 'stdin',
      targetValue: stdinText,
      depthMode,
      stats
    };
  }

  // Default git diff HEAD
  if (isGitRepo) {
    return {
      targetType: 'default',
      depthMode,
      stats,
      resolvedDiffCommand: 'git diff HEAD'
    };
  }

  return {
    targetType: 'default',
    depthMode,
    stats,
    error: 'No review target specified and this is not a git repository. Please provide --file, --dir, or --pr.'
  };
}
