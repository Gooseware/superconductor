import { createNotebookProvider } from '@superconductor/notebook-store';
import type {
  INotebookProvider,
  NotebookEntry,
  WriteAck,
  NotebookSummary,
  ValidationOptions,
} from '@superconductor/notebook-store';

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
    return await provider.query(params as any);
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
    const provider = await this.getProvider(projectRoot);
    const entry: Omit<NotebookEntry, 'id' | 'timestamp'> = {
      session_id: params.session_id || 'default-session',
      track_id: params.track_id || 'default-track',
      agent_role: params.agent_role || 'agent',
      domain: params.domain,
      files: params.files || [],
      note_type: params.note_type as any,
      content: params.content,
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
    params: { track_id?: string },
    projectRoot: string
  ): Promise<NotebookSummary> {
    const provider = await this.getProvider(projectRoot);
    return await provider.summary(params.track_id);
  }
}
