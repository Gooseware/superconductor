import path from 'path';
import { fileURLToPath } from 'url';
import { createTaskProvider } from '../packages/task-store/src/providers/task-provider-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedInvariants() {
  const workspacePath = path.resolve(__dirname, '..');
  const provider = await createTaskProvider(workspacePath);
  
  const seedInvariants = [
    {
      capability: 'task-status-reporting',
      path: 'commands/superconductor/status.toml',
      rationale: 'Core orchestrator command for task status.',
      status: 'active' as const
    },
    {
      capability: 'core-workflow',
      path: 'superconductor/workflow.md',
      rationale: 'Primary Superconductor workflow definitions.',
      status: 'active' as const
    },
    {
      capability: 'task-store-factory',
      path: 'packages/task-store/src/providers/task-provider-factory.ts',
      rationale: 'The task store provider factory must remain intact.',
      status: 'active' as const
    },
    {
      capability: 'invariant-discovery',
      path: 'agents/superconductor-invariant-discovery/agent.md',
      rationale: 'Agent responsible for discovering new invariants.',
      status: 'active' as const
    }
  ];

  for (const inv of seedInvariants) {
    console.log(`Seeding invariant for: ${inv.path}`);
    await provider.createInvariant({
      capability: inv.capability,
      path: inv.path,
      rationale: inv.rationale,
      status: inv.status
    });
  }

  console.log('Successfully seeded core invariants.');
  await provider.close();
}

if (process.env.NODE_ENV !== 'test') {
  seedInvariants().catch(err => {
    console.error('Failed to seed invariants:', err);
    process.exit(1);
  });
}
