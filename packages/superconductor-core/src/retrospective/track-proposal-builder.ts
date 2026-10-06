import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import {
  trackProposalSchema,
  type TrackProposal,
  type ProposalCategory,
  type ProposalStatus,
} from '../schema/track-proposal.js';

export interface TrackProposalInput {
  id?: string;
  title: string;
  category: ProposalCategory;
  origin?: string;
  sourceTrackId?: string;
  confidence?: number;
  tags?: string[];
  status?: ProposalStatus;
  createdAt?: string;
  problemStatement: string;
  proposedScope: string;
  affectedFiles?: string[];
  deliverables?: string[];
  acceptanceCriteria?: string[];
  metadata?: Record<string, any>;
}

export interface BuildProposalResult {
  proposalId: string;
  filename: string;
  relativeFilePath: string;
  markdown: string;
  data: TrackProposal;
}

export interface TrackProposalBuilderOptions {
  projectRoot?: string;
  suggestionsDir?: string;
}

export class TrackProposalBuilder {
  private projectRoot: string;
  private suggestionsDir: string;

  constructor(options: TrackProposalBuilderOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.suggestionsDir = options.suggestionsDir || path.join('superconductor', 'suggestions');
  }

  /**
   * Generates a deterministic slug from a proposal title and date.
   * e.g. "Improve Quorum Timeout" -> "improve_quorum_timeout_20261006"
   */
  public static generateSlug(title: string, date: Date = new Date()): string {
    const cleanTitle = (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const base = cleanTitle || 'track_proposal';
    return `${base}_${dateStr}`;
  }

  /**
   * Builds the complete proposal markdown with frontmatter and required sections.
   */
  public build(input: TrackProposalInput): BuildProposalResult {
    const createdAt = input.createdAt || new Date().toISOString();
    const proposalId = input.id || TrackProposalBuilder.generateSlug(input.title, new Date(createdAt));

    const validatedData: TrackProposal = trackProposalSchema.parse({
      id: proposalId,
      title: input.title,
      category: input.category,
      origin: input.origin || `Synthesized from post-run retrospective`,
      sourceTrackId: input.sourceTrackId,
      confidence: input.confidence ?? 1.0,
      tags: input.tags || [],
      status: input.status || 'proposed',
      createdAt,
      problemStatement: input.problemStatement,
      proposedScope: input.proposedScope,
      affectedFiles: input.affectedFiles || [],
      deliverables: input.deliverables || [],
      acceptanceCriteria: input.acceptanceCriteria || [],
      metadata: input.metadata,
    });

    const frontmatterObj: Record<string, any> = {
      id: validatedData.id,
      title: validatedData.title,
      category: validatedData.category,
      confidence: validatedData.confidence,
      status: validatedData.status,
      created_at: validatedData.createdAt,
    };

    if (validatedData.origin) frontmatterObj.origin = validatedData.origin;
    if (validatedData.sourceTrackId) frontmatterObj.source_track_id = validatedData.sourceTrackId;
    if (validatedData.tags && validatedData.tags.length > 0) frontmatterObj.tags = validatedData.tags;
    if (validatedData.metadata) frontmatterObj.metadata = validatedData.metadata;

    const frontmatterYaml = yaml.dump(frontmatterObj, { lineWidth: -1 }).trim();

    const affectedFilesSection =
      validatedData.affectedFiles.length > 0
        ? validatedData.affectedFiles.map((f) => `- \`${f}\``).join('\n')
        : '_None explicitly specified._';

    const deliverablesSection =
      validatedData.deliverables.length > 0
        ? validatedData.deliverables.map((d) => `- [ ] ${d}`).join('\n')
        : '_None explicitly specified._';

    const acSection =
      validatedData.acceptanceCriteria.length > 0
        ? validatedData.acceptanceCriteria.map((ac) => `- [ ] ${ac}`).join('\n')
        : '_None explicitly specified._';

    const markdown = [
      '---',
      frontmatterYaml,
      '---',
      '',
      `# Superconductor Track Proposal: ${validatedData.title}`,
      '',
      `**Track Identifier:** \`${validatedData.id}\`  `,
      `**Category:** \`${validatedData.category}\`  `,
      `**Origin:** ${validatedData.origin || 'Autonomous Retrospective'}  `,
      `**Confidence:** ${validatedData.confidence.toFixed(2)}  `,
      '',
      '---',
      '',
      '## 1. Problem Statement',
      '',
      validatedData.problemStatement,
      '',
      '## 2. Proposed Scope & Architecture',
      '',
      validatedData.proposedScope,
      '',
      '## 3. Touched Files & Affected Modules',
      '',
      affectedFilesSection,
      '',
      '## 4. Key Deliverables',
      '',
      deliverablesSection,
      '',
      '## 5. Verification & Acceptance Criteria',
      '',
      acSection,
      '',
    ].join('\n');

    const filename = `${proposalId}.md`;
    const relativeFilePath = path.join(this.suggestionsDir, filename).replace(/\\/g, '/');

    return {
      proposalId,
      filename,
      relativeFilePath,
      markdown,
      data: validatedData,
    };
  }

  /**
   * Persists the generated proposal markdown to superconductor/suggestions/<suggestion_id>.md.
   */
  public async save(
    input: TrackProposalInput,
    overrideDir?: string
  ): Promise<{ filePath: string; result: BuildProposalResult }> {
    const result = this.build(input);
    const targetDir = overrideDir
      ? path.isAbsolute(overrideDir)
        ? overrideDir
        : path.join(this.projectRoot, overrideDir)
      : path.join(this.projectRoot, this.suggestionsDir);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, result.filename);
    fs.writeFileSync(filePath, result.markdown, 'utf8');

    return { filePath, result };
  }

  /**
   * Parses markdown proposal content and validates it back into TrackProposal.
   */
  public static parse(markdown: string): TrackProposal {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      throw new Error('Invalid track proposal format: Missing YAML frontmatter');
    }

    const rawFrontmatter = match[1];
    const body = match[2];

    const parsedYaml = (yaml.load(rawFrontmatter) || {}) as Record<string, any>;

    const extractSection = (secNum: number, title: string): string => {
      const regex = new RegExp(`##\\s*${secNum}\\.\\s*${title}[\\r\\n]+([\\s\\S]*?)(?=(?:##\\s*\\d+\\.|\\Z))`, 'i');
      const m = body.match(regex);
      return m ? m[1].trim() : '';
    };

    const problemStatement = extractSection(1, 'Problem Statement');
    const proposedScope = extractSection(2, 'Proposed Scope & Architecture');

    const extractList = (secNum: number, title: string): string[] => {
      const raw = extractSection(secNum, title);
      if (!raw || raw.includes('_None explicitly specified._')) return [];
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('-') || line.startsWith('*'))
        .map((line) => line.replace(/^[-*]\s*(\[[ x]\]\s*)?`?|`?$/gi, '').trim())
        .filter(Boolean);
    };

    const affectedFiles = extractList(3, 'Touched Files & Affected Modules');
    const deliverables = extractList(4, 'Key Deliverables');
    const acceptanceCriteria = extractList(5, 'Verification & Acceptance Criteria');

    return trackProposalSchema.parse({
      id: parsedYaml.id,
      title: parsedYaml.title,
      category: parsedYaml.category,
      origin: parsedYaml.origin,
      sourceTrackId: parsedYaml.source_track_id || parsedYaml.sourceTrackId,
      confidence: parsedYaml.confidence ?? 1.0,
      tags: parsedYaml.tags || [],
      status: parsedYaml.status || 'proposed',
      createdAt: parsedYaml.created_at || parsedYaml.createdAt,
      problemStatement: problemStatement || parsedYaml.problemStatement || '',
      proposedScope: proposedScope || parsedYaml.proposedScope || '',
      affectedFiles: affectedFiles.length > 0 ? affectedFiles : parsedYaml.affectedFiles || [],
      deliverables: deliverables.length > 0 ? deliverables : parsedYaml.deliverables || [],
      acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : parsedYaml.acceptanceCriteria || [],
      metadata: parsedYaml.metadata,
    });
  }
}
