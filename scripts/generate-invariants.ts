import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTaskProvider } from '../packages/task-store/src/providers/task-provider-factory.js';
import { InvariantResult, OverrideResult } from '../packages/task-store/src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function formatInvariantsMarkdown(
  activeInvariants: InvariantResult[],
  untriagedInvariants: InvariantResult[],
  activeOverrides: OverrideResult[]
): string {
  let md = `# Superconductor Invariants Ledger\n\n`;
  md += `> Auto-generated audit trail of system invariants and active overrides.\n\n`;

  // Active Invariants Table
  md += `## Active Invariants\n\n`;
  if (activeInvariants.length === 0) {
    md += `*No active invariants registered.*\n\n`;
  } else {
    md += `| ID | Capability | Path | Track ID | Task ID | Rationale |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const inv of activeInvariants) {
      const trackId = inv.track_id || '-';
      const taskId = inv.task_id || '-';
      const rationale = (inv.rationale || '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      const capability = inv.capability.replace(/\|/g, '\\|');
      const filePath = inv.path.replace(/\|/g, '\\|');
      md += `| \`${inv.id}\` | ${capability} | \`${filePath}\` | ${trackId} | ${taskId} | ${rationale} |\n`;
    }
    md += `\n`;
  }

  // Untriaged Invariants Table
  md += `## Untriaged Invariants\n\n`;
  if (untriagedInvariants.length === 0) {
    md += `*No untriaged invariants registered.*\n\n`;
  } else {
    md += `| ID | Capability | Path | Track ID | Task ID | Rationale |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const inv of untriagedInvariants) {
      const trackId = inv.track_id || '-';
      const taskId = inv.task_id || '-';
      const rationale = (inv.rationale || '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      const capability = inv.capability.replace(/\|/g, '\\|');
      const filePath = inv.path.replace(/\|/g, '\\|');
      md += `| \`${inv.id}\` | ${capability} | \`${filePath}\` | ${trackId} | ${taskId} | ${rationale} |\n`;
    }
    md += `\n`;
  }

  // Active Overrides Table
  md += `## Active Overrides\n\n`;
  if (activeOverrides.length === 0) {
    md += `*No active overrides registered.*\n\n`;
  } else {
    md += `| ID | Invariant ID | Track ID | Reason | Created At |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const ovr of activeOverrides) {
      const reason = (ovr.reason || '-').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      const createdAt = new Date(ovr.created_at).toISOString();
      md += `| \`${ovr.id}\` | \`${ovr.invariant_id}\` | ${ovr.track_id} | ${reason} | ${createdAt} |\n`;
    }
    md += `\n`;
  }

  return md;
}

export async function generateInvariants(workspacePath: string = process.cwd(), trackId?: string): Promise<string> {
  const provider = await createTaskProvider(workspacePath);
  
  const allInvariants = await provider.queryInvariants(trackId ? { track_id: trackId } : {});
  const activeOverrides = await provider.queryOverrides(trackId ? { track_id: trackId, status: 'active' } : { status: 'active' });
  await provider.close();

  const activeInvariants = allInvariants.filter(i => i.status === 'active');
  const untriagedInvariants = allInvariants.filter(i => i.status === 'untriaged');

  const content = formatInvariantsMarkdown(activeInvariants, untriagedInvariants, activeOverrides);
  const targetDir = path.join(workspacePath, 'superconductor');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.join(targetDir, 'invariants.md');
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log(`Generated ${targetPath} with ${activeInvariants.length} active invariants, ${untriagedInvariants.length} untriaged invariants, and ${activeOverrides.length} active overrides.`);
  return targetPath;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  generateInvariants().catch(err => {
    console.error('Failed to generate invariants:', err);
    process.exit(1);
  });
}
