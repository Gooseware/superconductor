import React, { useState, useMemo } from 'react';
import { AstryxCard, AstryxButton } from '../../../components/astryx/index.js';
import { CandidateItem } from './CandidateList.js';
import { RefactoringCandidate } from '../types.js';

export interface TrackBatchPayload {
  batchVersion: string;
  generatedAt: string;
  selectedCount: number;
  commands: string[];
  tracks: Array<{
    trackId: string;
    title: string;
    description: string;
    filesAffected: string[];
    cliCommand: string;
  }>;
}

export interface TrackGeneratorProps {
  candidates: (CandidateItem | RefactoringCandidate)[];
  selectedCandidateIds: string[];
  onGenerateTrack?: (generatedCommand: string, selectedCandidates: (CandidateItem | RefactoringCandidate)[]) => void;
  onGenerateTracks?: (commands: string[], selectedCandidates: (CandidateItem | RefactoringCandidate)[]) => void | Promise<void>;
  onDownloadTrackBatch?: (payload: TrackBatchPayload) => void;
  className?: string;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`astryx-skeleton h-44 w-full rounded-md ${className}`.trim()} />
  );
}

/**
 * Sanitizes a track ID against /^[a-zA-Z0-9_-]+$/.
 * Replaces any character not in [a-zA-Z0-9_-] with an underscore.
 */
export function sanitizeTrackId(id: string): string {
  if (!id) return 'track';
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || 'track';
}

/**
 * Sanitizes a track title to prevent shell injection when generating CLI commands.
 * Strips newlines, control characters, and escapes double quotes, backticks, dollar signs, and backslashes.
 */
export function sanitizeTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/[\r\n\x00-\x1F\x7F]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\$/g, '\\$')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .trim();
}

export function TrackGenerator({
  candidates,
  selectedCandidateIds,
  onGenerateTrack,
  onGenerateTracks,
  onDownloadTrackBatch,
  className = ''
}: TrackGeneratorProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState(false);

  const selectedCandidates = useMemo(() => {
    return candidates.filter((c) => selectedCandidateIds.includes(c.id));
  }, [candidates, selectedCandidateIds]);

  // Generate deterministic /superconductor:new-track CLI commands for each selected candidate
  const trackCommands = useMemo<string[]>(() => {
    return selectedCandidates.map((c) => {
      const rawTrackId =
        (c as any).suggestedTrackId ||
        c.proposedTrack?.trackId ||
        c.targetTrackId ||
        c.id ||
        'track';

      const trackId = sanitizeTrackId(rawTrackId);
      const title = sanitizeTitle(c.proposedTrack?.title || c.title || '');
      return `/superconductor:new-track --id "${trackId}" --title "${title}"`;
    });
  }, [selectedCandidates]);

  // Formatted command string displayed in the terminal box
  const commandDisplayText = useMemo(() => {
    if (selectedCandidates.length === 0) {
      return '# Select one or more refactoring candidates above to generate a Superconductor track.';
    }

    const commandsList = trackCommands.join('\n');
    const legacyAliases = selectedCandidates
      .map((c) => {
        const rawTrackId =
          (c as any).suggestedTrackId ||
          c.proposedTrack?.trackId ||
          c.targetTrackId ||
          c.id ||
          'track';
        const trackId = sanitizeTrackId(rawTrackId);
        return `# Shorthand CLI: superconductor track create ${trackId}`;
      })
      .join('\n');

    return `${commandsList}\n\n${legacyAliases}`;
  }, [selectedCandidates, trackCommands]);

  const handleCopyCliCommand = async () => {
    if (selectedCandidates.length === 0) return;
    const textToCopy = trackCommands.join('\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setCopyError(null);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      // UX-ERG-01: do NOT call setCopied(true) on error!
      setCopyError('Failed to copy to clipboard');
      setTimeout(() => setCopyError(null), 3000);
    }
  };

  const handleCopy = handleCopyCliCommand;

  const buildBatchPayload = (): TrackBatchPayload => ({
    batchVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    selectedCount: selectedCandidates.length,
    commands: trackCommands,
    tracks: selectedCandidates.map((c, i) => {
      const rawTrackId =
        (c as any).suggestedTrackId ||
        c.proposedTrack?.trackId ||
        c.targetTrackId ||
        c.id ||
        'track';
      const trackId = sanitizeTrackId(rawTrackId);
      const title = sanitizeTitle(c.proposedTrack?.title || c.title || '');
      return {
        trackId,
        title,
        description: c.proposedTrack?.description || c.description,
        filesAffected:
          c.files ||
          c.redundantComponents ||
          c.proposedTrack?.filesAffected ||
          [],
        cliCommand: trackCommands[i]
      };
    })
  });

  const handleCopyBatch = async () => {
    if (selectedCandidates.length === 0) return;
    const payload = buildBatchPayload();

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setCopied(true);
        setCopyError(null);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      // UX-ERG-01: do NOT call setCopied(true) on error!
      setCopyError('Failed to copy batch payload');
      setTimeout(() => setCopyError(null), 3000);
    }
  };

  const handleGenerate = () => {
    if (selectedCandidates.length === 0) return;
    setGenerationSuccess(true);

    onGenerateTracks?.(trackCommands, selectedCandidates);
    onGenerateTrack?.(commandDisplayText, selectedCandidates);

    setTimeout(() => setGenerationSuccess(false), 3000);
  };

  const handleDownloadBatch = () => {
    if (selectedCandidates.length === 0) return;

    const payload = buildBatchPayload();

    if (onDownloadTrackBatch) {
      onDownloadTrackBatch(payload);
    } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `superconductor-tracks-batch-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <AstryxCard
      title="Track Generator"
      subtitle="Synthesize chosen refactorings into executable Superconductor tracks"
      className={`astryx-track-generator ${className}`.trim()}
    >
      <div className="astryx-track-generator-panel">
        <div className="astryx-track-generator-header">
          <div className="astryx-track-generator-stats">
            <span className="astryx-track-generator-count">
              {selectedCandidates.length} refactoring candidate(s) selected
            </span>
            <p className="astryx-track-generator-subtext">
              Generates deterministic /superconductor:new-track commands and staging proposals.
            </p>
          </div>

          <div className="astryx-track-generator-actions">
            <AstryxButton
              variant="outline"
              size="sm"
              onClick={handleCopy}
              onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => { if (e.key === 'Enter') handleCopy(); }}
              tabIndex={0}
              disabled={selectedCandidates.length === 0}
              aria-label="Copy All Commands"
              data-testid="copy-commands-btn"
            >
              {copied ? '✓ Copied' : '📋 Copy All Commands'}
            </AstryxButton>

            <AstryxButton
              variant="secondary"
              size="sm"
              onClick={handleDownloadBatch}
              onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => { if (e.key === 'Enter') handleDownloadBatch(); }}
              tabIndex={0}
              disabled={selectedCandidates.length === 0}
              aria-label="Download Track Batch"
              data-testid="download-batch-btn"
            >
              💾 Download Track Batch
            </AstryxButton>

            <AstryxButton
              variant="primary"
              size="md"
              onClick={handleGenerate}
              onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => { if (e.key === 'Enter') handleGenerate(); }}
              tabIndex={0}
              disabled={selectedCandidates.length === 0}
              aria-label="Generate Superconductor Tracks"
              data-testid="generate-tracks-btn"
            >
              {generationSuccess ? '🚀 Tracks Dispatched!' : '✨ Generate Selected Tracks'}
            </AstryxButton>
          </div>
        </div>

        {/* Command Output Terminal */}
        <div className="astryx-command-terminal">
          <div className="astryx-terminal-topbar">
            <span className="astryx-terminal-title">Deterministic Track CLI Commands</span>
            <span className="astryx-terminal-lang">bash</span>
          </div>

          <pre
            data-testid="terminal-command-code"
            className={`astryx-command-code ${
              selectedCandidates.length === 0 ? 'astryx-command-code-empty' : ''
            }`}
          >
            {commandDisplayText}
          </pre>
        </div>

        {copyError && (
          <div className="astryx-alert-error" role="alert" data-testid="copy-error-alert">
            ⚠ {copyError}
          </div>
        )}

        {generationSuccess && (
          <div className="astryx-alert-success">
            ✓ Track payload successfully emitted. Run the commands in your terminal or dispatch through Swarm Orchestrator.
          </div>
        )}
      </div>
    </AstryxCard>
  );
}
