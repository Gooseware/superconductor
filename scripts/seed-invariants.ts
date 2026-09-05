import path from 'path';
import { fileURLToPath } from 'url';
import { createTaskProvider } from '../packages/task-store/src/providers/task-provider-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const INITIAL_SEEDED_INVARIANTS = [
  // 7 Slash Commands in commands/superconductor/*.toml
  {
    capability: 'command-implement',
    path: 'commands/superconductor/implement.toml',
    rationale: 'Core orchestrator command for track task implementation.',
    status: 'active' as const
  },
  {
    capability: 'command-newTrack',
    path: 'commands/superconductor/newTrack.toml',
    rationale: 'Core orchestrator command for initializing new tracks.',
    status: 'active' as const
  },
  {
    capability: 'command-revert',
    path: 'commands/superconductor/revert.toml',
    rationale: 'Core orchestrator command for reverting track changes.',
    status: 'active' as const
  },
  {
    capability: 'command-review',
    path: 'commands/superconductor/review.toml',
    rationale: 'Core orchestrator command for reviewer quorum and sign-off.',
    status: 'active' as const
  },
  {
    capability: 'command-setup',
    path: 'commands/superconductor/setup.toml',
    rationale: 'Core orchestrator command for setup and environment validation.',
    status: 'active' as const
  },
  {
    capability: 'task-status-reporting',
    path: 'commands/superconductor/status.toml',
    rationale: 'Core orchestrator command for task status.',
    status: 'active' as const
  },
  {
    capability: 'command-yolo',
    path: 'commands/superconductor/yolo.toml',
    rationale: 'Core orchestrator command for unconstrained execution mode.',
    status: 'active' as const
  },

  // 11 MCP Tools in superconductor-kernel
  {
    capability: 'task_create',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for task creation.',
    status: 'active' as const
  },
  {
    capability: 'task_update',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for task updates and status transitions.',
    status: 'active' as const
  },
  {
    capability: 'task_query',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for querying tasks and semantic search.',
    status: 'active' as const
  },
  {
    capability: 'invariant_query',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for querying invariants.',
    status: 'active' as const
  },
  {
    capability: 'invariant_override',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for overriding invariants.',
    status: 'active' as const
  },
  {
    capability: 'task_get_invariants',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for retrieving invariants and active overrides.',
    status: 'active' as const
  },
  {
    capability: 'notebook_write',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for notebook writes.',
    status: 'active' as const
  },
  {
    capability: 'notebook_query',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for notebook queries.',
    status: 'active' as const
  },
  {
    capability: 'notebook_summary',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for notebook summaries.',
    status: 'active' as const
  },
  {
    capability: 'kernel_graph_get_node',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for dependency graph node retrieval.',
    status: 'active' as const
  },
  {
    capability: 'kernel_policy_get_mode',
    path: 'packages/superconductor-kernel/src/index.ts',
    rationale: 'Kernel MCP tool for querying policy mode.',
    status: 'active' as const
  },

  // 6 Core Orchestration Files
  {
    capability: 'workspace-guard',
    path: 'packages/superconductor-core/src/orchestration/workspace-guard.ts',
    rationale: 'Core orchestration guard preventing illegal workspace modifications.',
    status: 'active' as const
  },
  {
    capability: 'sign-off-gate',
    path: 'packages/superconductor-core/src/orchestration/sign-off-gate.ts',
    rationale: 'Core orchestration gate for reviewer sign-off consensus.',
    status: 'active' as const
  },
  {
    capability: 'quorum-validator',
    path: 'packages/superconductor-core/src/orchestration/quorum-validator.ts',
    rationale: 'Core orchestration validator enforcing reviewer quorum.',
    status: 'active' as const
  },
  {
    capability: 'remediation-orchestrator',
    path: 'packages/superconductor-core/src/remediation/remediation-orchestrator.ts',
    rationale: 'Core orchestration service for remediating reviewer findings.',
    status: 'active' as const
  },
  {
    capability: 'checkpoint-orchestrator',
    path: 'packages/superconductor-core/src/orchestration/checkpoint-orchestrator.ts',
    rationale: 'Core orchestration service for track checkpoints and milestones.',
    status: 'active' as const
  },
  {
    capability: 'task-store-factory',
    path: 'packages/task-store/src/providers/task-provider-factory.ts',
    rationale: 'The task store provider factory must remain intact.',
    status: 'active' as const
  },

  // Core Workflow Document
  {
    capability: 'core-workflow',
    path: 'superconductor/workflow.md',
    rationale: 'Primary Superconductor workflow definitions.',
    status: 'active' as const
  },

  // Invariant Discovery Agent
  {
    capability: 'invariant-discovery',
    path: 'agents/superconductor-invariant-discovery/agent.md',
    rationale: 'Agent responsible for discovering new invariants.',
    status: 'active' as const
  }
];

export async function seedInvariants(workspacePath: string = path.resolve(__dirname, '..')) {
  const provider = await createTaskProvider(workspacePath);

  // Clean up duplicate seed invariants if any exist
  try {
    const client = (provider as any).client || (provider as any).inner?.client;
    if (client) {
      await client.execute(`
        DELETE FROM invariants WHERE path LIKE '%track-lifecycle-wizard.ts%';
      `);
      await client.execute(`
        DELETE FROM invariants 
        WHERE track_id IS NULL
          AND id NOT IN (SELECT invariant_id FROM invariant_overrides)
          AND rowid NOT IN (
            SELECT MIN(rowid) FROM invariants WHERE track_id IS NULL GROUP BY capability, path
          )
      `);
    }
  } catch (err) {
    // Ignore if not supported
  }

  for (const inv of INITIAL_SEEDED_INVARIANTS) {
    const existing = await provider.queryInvariants({
      capability: inv.capability,
      path: inv.path,
    });
    if (existing.length === 0) {
      console.log(`Seeding invariant for: ${inv.path} (${inv.capability})`);
      await provider.createInvariant({
        capability: inv.capability,
        path: inv.path,
        rationale: inv.rationale,
        status: inv.status
      });
    } else {
      console.log(`Invariant already seeded for: ${inv.path} (${inv.capability})`);
    }
  }

  console.log('Successfully seeded core invariants.');
  await provider.close();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  seedInvariants().catch(err => {
    console.error('Failed to seed invariants:', err);
    process.exit(1);
  });
}
