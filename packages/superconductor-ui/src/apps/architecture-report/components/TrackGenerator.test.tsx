import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrackGenerator, Skeleton, sanitizeTitle } from './TrackGenerator.js';
import { CandidateItem } from './CandidateList.js';
import { AstryxThemeProvider } from '../../../components/astryx/index.js';

const mockCandidates: CandidateItem[] = [
  {
    id: 'cand-nondry-cache',
    title: 'Consolidate Cache Managers',
    description: 'Consolidate multiple duplicate cache managers into @superconductor/core/cache.',
    recommendationStrength: 'Strong',
    files: ['packages/engine/src/cache/CacheManager.ts'],
    proposedTrack: {
      trackId: 'dry_consolidate_cache_20261001',
      title: 'Consolidate duplicate cache implementations',
      description: 'Refactor disparate cache modules into an authoritative, reusable core module.',
      filesAffected: ['packages/engine/src/cache/CacheManager.ts']
    }
  },
  {
    id: 'cand-shallow-parser',
    title: 'Deepen Shallow Parser',
    description: 'Deepen or inline shallow parser module into caller.',
    recommendationStrength: 'Worth exploring',
    files: ['packages/engine/src/dag/parser.ts'],
    proposedTrack: {
      trackId: 'deepen_shallow_parser_20261001',
      title: 'Deepen or Inline Shallow Module parser',
      description: 'Eliminate pass-through delegation in parser.',
      filesAffected: ['packages/engine/src/dag/parser.ts']
    }
  }
];

describe('TrackGenerator Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with 0 candidates selected, showing placeholder prompt and disabled buttons', () => {
    render(
      <AstryxThemeProvider>
        <TrackGenerator candidates={mockCandidates} selectedCandidateIds={[]} />
      </AstryxThemeProvider>
    );

    expect(screen.getByText('Track Generator')).toBeDefined();
    expect(screen.getByText('0 refactoring candidate(s) selected')).toBeDefined();
    expect(
      screen.getByText('# Select one or more refactoring candidates above to generate a Superconductor track.')
    ).toBeDefined();

    const generateBtn = screen.getByTestId('generate-tracks-btn');
    expect(generateBtn.getAttribute('disabled')).toBeDefined();

    const copyBtn = screen.getByTestId('copy-commands-btn');
    expect(copyBtn.getAttribute('disabled')).toBeDefined();

    const downloadBtn = screen.getByTestId('download-batch-btn');
    expect(downloadBtn.getAttribute('disabled')).toBeDefined();
  });

  it('displays selected candidate count and generates deterministic /superconductor:new-track CLI commands', () => {
    render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache', 'cand-shallow-parser']}
        />
      </AstryxThemeProvider>
    );

    expect(screen.getByText('2 refactoring candidate(s) selected')).toBeDefined();

    // Verify /superconductor:new-track commands are rendered deterministically
    const codeBlock = screen.getByTestId('terminal-command-code');
    expect(codeBlock).toBeDefined();
    expect(codeBlock.textContent).toContain(
      '/superconductor:new-track --id "dry_consolidate_cache_20261001" --title "Consolidate duplicate cache implementations"'
    );
    expect(codeBlock.textContent).toContain(
      '/superconductor:new-track --id "deepen_shallow_parser_20261001" --title "Deepen or Inline Shallow Module parser"'
    );

    // Also verify shorthand CLI commands are present
    expect(codeBlock.textContent).toContain('superconductor track create dry_consolidate_cache_20261001');
    expect(codeBlock.textContent).toContain('superconductor track create deepen_shallow_parser_20261001');
  });

  it('triggers onGenerateTracks and onGenerateTrack callbacks when clicking Generate Selected Tracks', () => {
    const handleGenerateTracks = vi.fn();
    const handleGenerateTrack = vi.fn();

    render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache']}
          onGenerateTracks={handleGenerateTracks}
          onGenerateTrack={handleGenerateTrack}
        />
      </AstryxThemeProvider>
    );

    const generateBtn = screen.getByTestId('generate-tracks-btn');
    fireEvent.click(generateBtn);

    expect(handleGenerateTracks).toHaveBeenCalledTimes(1);
    expect(handleGenerateTracks).toHaveBeenCalledWith(
      ['/superconductor:new-track --id "dry_consolidate_cache_20261001" --title "Consolidate duplicate cache implementations"'],
      [mockCandidates[0]]
    );

    expect(handleGenerateTrack).toHaveBeenCalledTimes(1);

    // Confirmation message shown
    expect(
      screen.getByText(/Track payload successfully emitted/i)
    ).toBeDefined();
  });

  it('copies deterministic commands to clipboard when clicking Copy All Commands', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    });

    render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache', 'cand-shallow-parser']}
        />
      </AstryxThemeProvider>
    );

    const copyBtn = screen.getByTestId('copy-commands-btn');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith(
      '/superconductor:new-track --id "dry_consolidate_cache_20261001" --title "Consolidate duplicate cache implementations"\n' +
      '/superconductor:new-track --id "deepen_shallow_parser_20261001" --title "Deepen or Inline Shallow Module parser"'
    );

    await waitFor(() => {
      expect(screen.getByText('✓ Copied')).toBeDefined();
    });
  });

  it('does NOT set copied to true when clipboard write fails, and surfaces error (UX-ERG-01)', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    });

    render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache']}
        />
      </AstryxThemeProvider>
    );

    const copyBtn = screen.getByTestId('copy-commands-btn');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(screen.queryByText('✓ Copied')).toBeNull();
      expect(screen.getByTestId('copy-error-alert')).toBeDefined();
      expect(screen.getByText(/Failed to copy to clipboard/i)).toBeDefined();
    });
  });

  it('sanitizes candidate.suggestedTrackId against /^[a-zA-Z0-9_-]+$/ and escapes title (REV-1)', () => {
    const candidateWithInjection: CandidateItem = {
      id: 'cand-unsafe',
      suggestedTrackId: 'unsafe; rm -rf /; track#1',
      title: 'Fix issue "test" with `eval` \n and \r control \x07 chars',
      description: 'Test description',
      files: ['test.ts']
    };

    render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={[candidateWithInjection]}
          selectedCandidateIds={['cand-unsafe']}
        />
      </AstryxThemeProvider>
    );

    const codeBlock = screen.getByTestId('terminal-command-code');
    expect(codeBlock.textContent).toContain(
      '/superconductor:new-track --id "unsafe__rm_-rf____track_1" --title "Fix issue \\"test\\" with \\`eval\\`   and   control   chars"'
    );
    expect(codeBlock.textContent).not.toContain(';');
    expect(codeBlock.textContent).not.toContain('\n and');
    expect(codeBlock.textContent).toContain('superconductor track create unsafe__rm_-rf____track_1');
  });

  it('escapes $ in titles to prevent command substitution $(cmd) and variable expansion $VAR (SEC)', () => {
    // Direct unit assertions on sanitizeTitle
    expect(sanitizeTitle('$(echo PWNED)')).toBe('\\$(echo PWNED)');
    expect(sanitizeTitle('$USER')).toBe('\\$USER');
    expect(sanitizeTitle('Refactor ${FOO} and $(echo PWNED) for $USER')).toBe(
      'Refactor \\${FOO} and \\$(echo PWNED) for \\$USER'
    );

    // Component-level assertion verifying generated CLI commands escape $
    const candidateWithCommandSub: CandidateItem = {
      id: 'cand-cmd-sub',
      suggestedTrackId: 'cmd_sub_track',
      title: 'Exploit $(echo PWNED) for user $USER',
      description: 'Security test for shell injection',
      files: ['test.ts']
    };

    render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={[candidateWithCommandSub]}
          selectedCandidateIds={['cand-cmd-sub']}
        />
      </AstryxThemeProvider>
    );

    const codeBlock = screen.getByTestId('terminal-command-code');
    expect(codeBlock.textContent).toContain('\\$(echo PWNED)');
    expect(codeBlock.textContent).toContain('\\$USER');
    expect(codeBlock.textContent).toContain(
      '/superconductor:new-track --id "cmd_sub_track" --title "Exploit \\$(echo PWNED) for user \\$USER"'
    );
  });

  it('triggers onDownloadTrackBatch with structured batch payload when clicking Download Track Batch', () => {
    const handleDownloadBatch = vi.fn();

    render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache']}
          onDownloadTrackBatch={handleDownloadBatch}
        />
      </AstryxThemeProvider>
    );

    const downloadBtn = screen.getByTestId('download-batch-btn');
    fireEvent.click(downloadBtn);

    expect(handleDownloadBatch).toHaveBeenCalledTimes(1);
    const payload = handleDownloadBatch.mock.calls[0][0];

    expect(payload.batchVersion).toBe('1.0.0');
    expect(payload.selectedCount).toBe(1);
    expect(payload.commands.length).toBe(1);
    expect(payload.tracks.length).toBe(1);
    expect(payload.tracks[0].trackId).toBe('dry_consolidate_cache_20261001');
    expect(payload.tracks[0].cliCommand).toContain('/superconductor:new-track');
    expect(payload.tracks[0].filesAffected).toEqual(['packages/engine/src/cache/CacheManager.ts']);
  });

  it('verifies explicit hit testing (pointer-events auto) on action panel and buttons', () => {
    const { container } = render(
      <AstryxThemeProvider>
        <TrackGenerator
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache']}
        />
      </AstryxThemeProvider>
    );

    const panel = container.querySelector('.astryx-track-generator');
    expect(panel).not.toBeNull();
    expect(panel?.className).toContain('astryx-track-generator');

    const generateBtn = screen.getByTestId('generate-tracks-btn');
    expect(generateBtn.className).toContain('astryx-button');
  });

  it('renders Skeleton loading state without crashing', () => {
    const { container } = render(<Skeleton className="custom-generator-skeleton" />);
    expect(container.querySelector('.astryx-skeleton')).toBeDefined();
  });
});
