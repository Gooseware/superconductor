/**
 * Shared Schema Types for Superconductor and Caduceus integration.
 */

export type TrackStatus = 'planned' | 'in_progress' | 'completed' | 'archived';

export interface Track {
  trackId: string;
  title: string;
  type: string;
  status: TrackStatus;
  repos?: string[];
  targetBranch?: string;
  created: string;
  updated: string;
  description: string;
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RegistryComponentFile {
  path: string;
  content: string;
}

export interface RegistryComponentMetadata {
  type: 'atom' | 'molecule' | 'organism' | 'template' | 'logic';
  description: string;
  tags: string[];
  dependencies: string[];
  author?: string;
}

export interface RegistryComponent {
  componentId: string;
  name: string;
  metadata: RegistryComponentMetadata;
  files: RegistryComponentFile[];
  createdAt: string;
}

export interface ComponentStagingManifest {
  componentId: string;
  trackId: string;
  timestamp: string;
  metadata: RegistryComponentMetadata;
  files: RegistryComponentFile[];
}

export interface ModelTierConfig {
  tier1: string;
  tier2: string;
  tier3: string;
  tier4: string;
}

export interface ActiveModelSelection {
  model: string;
  tier: string;
  updatedAt: string;
  source: 'cache' | 'tui' | 'override' | 'caduceus_suggestion';
}

export interface IModelRouter {
  getAvailableModels(): Promise<string[]>;
  resolveModel(tier: string): Promise<string>;
  selectModelInteractive(models: string[]): Promise<string>;
}

export interface SuperconductorContextTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  tier?: string;
}

export interface SuperconductorContext {
  workspaceRoot: string;
  activeTrackId: string | null;
  activePhase: string | null;
  activeTier: string | null;
  incompleteTasks: SuperconductorContextTask[];
  activeModel: string | null;
}

export interface AgentTurnEvent {
  id: string;
  eventType: 'task_completed' | 'phase_completed' | 'track_completed';
  sessionId: string;
  trackId: string;
  phase: string;
  taskDescription: string;
  modelUsed: string;
  taskType: string;
  success: boolean;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface AdaptiveRouteSuggestion {
  taskType: string;
  suggestedModel: string | null;
  confidenceScore: number;
  sampleCount: number;
  reason: string;
}
