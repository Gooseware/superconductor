import { createNotebookProvider, ValidationError } from '@superconductor/notebook-store';
import type {
  INotebookProvider,
  NotebookEntry,
  WriteAck,
  NotebookSummary,
  ValidationOptions,
  NoteType,
} from '@superconductor/notebook-store';

function wrapNotebookEntryTags(content: string): string {
  if (typeof content !== 'string') return content;
  if (content.startsWith('<notebook_entry>') && content.endsWith('</notebook_entry>')) {
    return content;
  }
  return `<notebook_entry>${content}</notebook_entry>`;
}

function stripNotebookEntryTags(content: string): string {
  if (typeof content !== 'string') return content;
  let result = content;
  while (result.startsWith('<notebook_entry>') && result.endsWith('</notebook_entry>')) {
    result = result.slice('<notebook_entry>'.length, -('</notebook_entry>'.length));
  }
  return result.replace(/<\/?notebook_entry>/g, '');
}

export class NotebookService {
  private providers: Map<string, INotebookProvider> = new Map();

  async getProvider(projectRoot: string): Promise<INotebookProvider> {
    if (!this.providers.has(projectRoot)) {
      this.providers.set(projectRoot, await createNotebookProvider(projectRoot));
    }
    return this.providers.get(projectRoot)!;
  }

  async query(
    params: {
      query?: string;
      files?: string[];
      domain?: string;
      note_types?: string[];
      severity?: string;
      limit?: number;
    },
    projectRoot: string
  ): Promise<NotebookEntry[]> {
    const provider = await this.getProvider(projectRoot);
    const results = await provider.query(params as any);
    return results.map((entry) => ({
      ...entry,
      content: stripNotebookEntryTags(entry.content),
    }));
  }

  async write(
    params: {
      note_type: string;
      content: string;
      files: string[];
      domain: string;
      severity: string;
      session_id?: string;
      track_id?: string;
      agent_role?: string;
      reviewer_token?: string;
      user_confirmed?: boolean;
      invocation_id: string;
    },
    projectRoot: string
  ): Promise<WriteAck> {
    if (!params.track_id || params.track_id.trim() === '') {
      throw new ValidationError('track_id is required');
    }

    const provider = await this.getProvider(projectRoot);
    const entry: Omit<NotebookEntry, 'id' | 'timestamp'> = {
      session_id: params.session_id || 'default-session',
      track_id: params.track_id,
      agent_role: params.agent_role || 'agent',
      domain: params.domain,
      files: params.files || [],
      note_type: params.note_type as any,
      content: wrapNotebookEntryTags(params.content),
      severity: params.severity as any,
      reviewer_token: params.reviewer_token,
    };
    const options: ValidationOptions = {
      user_confirmed: params.user_confirmed,
      invocation_id: params.invocation_id,
    };
    return await provider.write(entry, options);
  }

  async summary(
    params: { track_id?: string; limit?: number },
    projectRoot: string
  ): Promise<NotebookSummary> {
    const provider = await this.getProvider(projectRoot);
    const rawSummary = await (provider as any).summary(params.track_id, params.limit);
    const by_type: Partial<Record<NoteType, NotebookEntry[]>> = {};
    if (rawSummary && rawSummary.by_type) {
      for (const [key, entries] of Object.entries(rawSummary.by_type)) {
        if (Array.isArray(entries)) {
          by_type[key as NoteType] = entries.map((entry: NotebookEntry) => ({
            ...entry,
            content: stripNotebookEntryTags(entry.content),
          }));
        }
      }
    }
    return {
      ...rawSummary,
      by_type,
    };
  }
}
