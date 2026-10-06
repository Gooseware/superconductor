import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TrackProposalBuilder,
  type TrackProposalInput,
} from './track-proposal-builder.js';

describe('TrackProposalBuilder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-proposal-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates deterministic track slugs from title and date', () => {
    const slug = TrackProposalBuilder.generateSlug(
      'Improve Quorum Preflight & Timeout Protocol',
      new Date('2026-10-06T12:00:00Z')
    );
    expect(slug).toBe('improve_quorum_preflight_timeout_protocol_20261006');
  });

  it('builds valid markdown with frontmatter and required sections for category: process', () => {
    const builder = new TrackProposalBuilder({ projectRoot: tmpDir });
    const input: TrackProposalInput = {
      title: 'Remediation Reviewer Prompt Hardening',
      category: 'process',
      origin: 'Track invariant_first_remediation_and_execution_quorum_20261006',
      sourceTrackId: 'invariant_first_remediation_and_execution_quorum_20261006',
      confidence: 0.88,
      tags: ['swarm', 'remediation', 'prompt'],
      problemStatement: 'Reviewers exhibited repeated prompt drift during multi-cycle remediation.',
      proposedScope: 'Inject invariant-first dogma statically into reviewer prompt headers.',
      affectedFiles: ['packages/engine/src/agents/reviewer-prompt.ts'],
      deliverables: ['Updated reviewer prompt templates', 'Dogma validation gate'],
      acceptanceCriteria: ['Reviewers cite runtime proof for all blocking findings'],
    };

    const result = builder.build(input);

    expect(result.proposalId).toBeDefined();
    expect(result.relativeFilePath).toBe(`superconductor/suggestions/${result.proposalId}.md`);
    expect(result.markdown).toContain('---');
    expect(result.markdown).toContain(`id: ${result.proposalId}`);
    expect(result.markdown).toContain('category: process');
    expect(result.markdown).toContain('confidence: 0.88');
    expect(result.markdown).toContain('# Superconductor Track Proposal: Remediation Reviewer Prompt Hardening');
    expect(result.markdown).toContain('## 1. Problem Statement');
    expect(result.markdown).toContain('## 2. Proposed Scope & Architecture');
    expect(result.markdown).toContain('## 3. Touched Files & Affected Modules');
    expect(result.markdown).toContain('## 4. Key Deliverables');
    expect(result.markdown).toContain('## 5. Verification & Acceptance Criteria');
    expect(result.markdown).toContain('packages/engine/src/agents/reviewer-prompt.ts');
  });

  it('builds valid proposal for category: codebase', () => {
    const builder = new TrackProposalBuilder({ projectRoot: tmpDir });
    const input: TrackProposalInput = {
      title: 'Decouple Legacy SQLite Schema Helpers',
      category: 'codebase',
      origin: 'Incidental tech debt discovered in touched files',
      confidence: 0.75,
      tags: ['tech-debt', 'sqlite', 'refactor'],
      problemStatement: 'Multiple modules directly import legacy sqlite helpers instead of using DatabaseManager.',
      proposedScope: 'Migrate legacy helpers to DatabaseManager and remove deprecated shims.',
      affectedFiles: ['src/db/legacy-helpers.ts'],
      deliverables: ['Refactored db access', 'Added missing unit tests'],
      acceptanceCriteria: ['All tests pass using DatabaseManager directly'],
    };

    const result = builder.build(input);
    expect(result.data.category).toBe('codebase');
    expect(result.markdown).toContain('category: codebase');
    expect(result.markdown).toContain('src/db/legacy-helpers.ts');
  });

  it('saves proposal markdown file to superconductor/suggestions/<suggestion_id>.md', async () => {
    const builder = new TrackProposalBuilder({ projectRoot: tmpDir });
    const input: TrackProposalInput = {
      id: 'custom_proposal_id_20261006',
      title: 'Refactor Auth Token Cache',
      category: 'codebase',
      confidence: 0.92,
      problemStatement: 'Cache eviction is missing for invalid auth tokens.',
      proposedScope: 'Add TTL eviction to token cache.',
      deliverables: ['TTL cache implementation'],
      acceptanceCriteria: ['Expired tokens are pruned on fetch'],
    };

    const saved = await builder.save(input);
    const expectedPath = path.join(tmpDir, 'superconductor', 'suggestions', 'custom_proposal_id_20261006.md');
    expect(saved.filePath).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);

    const content = fs.readFileSync(expectedPath, 'utf8');
    expect(content).toContain('id: custom_proposal_id_20261006');
    expect(content).toContain('Refactor Auth Token Cache');
  });

  it('parses and validates proposal markdown back into structured object', () => {
    const builder = new TrackProposalBuilder({ projectRoot: tmpDir });
    const input: TrackProposalInput = {
      id: 'roundtrip_suggestion_20261006',
      title: 'Roundtrip Test Suggestion',
      category: 'process',
      origin: 'Test origin',
      confidence: 0.85,
      tags: ['roundtrip'],
      problemStatement: 'Testing parse capabilities.',
      proposedScope: 'Parse frontmatter and sections cleanly.',
      affectedFiles: ['fileA.ts', 'fileB.ts'],
      deliverables: ['Roundtrip parser'],
      acceptanceCriteria: ['AC 1 is met'],
    };

    const built = builder.build(input);
    const parsed = TrackProposalBuilder.parse(built.markdown);

    expect(parsed.id).toBe('roundtrip_suggestion_20261006');
    expect(parsed.title).toBe('Roundtrip Test Suggestion');
    expect(parsed.category).toBe('process');
    expect(parsed.confidence).toBe(0.85);
    expect(parsed.problemStatement).toContain('Testing parse capabilities');
    expect(parsed.affectedFiles).toEqual(['fileA.ts', 'fileB.ts']);
  });
});
