import React, { useState } from 'react';
import { AstryxCard, AstryxCardHeader, AstryxCardContent, AstryxCheckbox, AstryxBadge, AstryxButton, RecommendationStrength } from '../../../components/astryx/index.js';
import { RefactoringCandidate } from '../types.js';

export interface ArchitectureCandidateBenefit {
  locality?: string;
  depth?: string;
  leverage?: string;
  testability?: string;
}

export interface ArchitectureCandidateBeforeAfter {
  beforeDiagram?: string;
  afterDiagram?: string;
  beforeDescription?: string;
  afterDescription?: string;
}

export interface ArchitectureProposedTrack {
  trackId: string;
  title: string;
  description: string;
  filesAffected: string[];
}

export interface CandidateItem {
  id: string;
  title: string;
  description: string;
  type?: string;
  domain?: string;
  recommendation?: RecommendationStrength;
  recommendationStrength?: RecommendationStrength;
  files?: string[];
  redundantComponents?: string[];
  partition?: string;
  couplingCluster?: string;
  estimatedTokenSavings?: string;
  benefits?: ArchitectureCandidateBenefit;
  beforeAfter?: ArchitectureCandidateBeforeAfter;
  beforeArchitecture?: string;
  afterArchitecture?: string;
  proposedTrack?: ArchitectureProposedTrack;
  targetTrackId?: string;
  suggestedTrackId?: string;
}

export interface CandidateListProps {
  candidates: (CandidateItem | RefactoringCandidate)[];
  selectedCandidateIds?: string[];
  onToggleCandidate?: (id: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  className?: string;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`astryx-skeleton h-48 w-full rounded-md ${className}`.trim()} />
  );
}

export function CandidateList({
  candidates,
  selectedCandidateIds = [],
  onToggleCandidate,
  onSelectAll,
  onClearSelection,
  className = ''
}: CandidateListProps) {
  const [filterStrength, setFilterStrength] = useState<string>('All');
  const [expandedDiagrams, setExpandedDiagrams] = useState<Record<string, boolean>>({});

  const filteredCandidates = candidates.filter((c) => {
    if (filterStrength === 'All') return true;
    const strength = c.recommendationStrength || c.recommendation;
    return strength === filterStrength;
  });

  const toggleDiagram = (id: string) => {
    setExpandedDiagrams((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className={`astryx-candidate-list ${className}`.trim()}>
      {/* Controls and Filter Bar */}
      <div className="astryx-candidate-controls">
        <div className="astryx-filter-group">
          <span className="astryx-filter-label">Filter by Strength:</span>
          {(['All', 'Strong', 'Worth exploring', 'Speculative'] as const).map((strength) => {
            const isActive = filterStrength === strength;
            const btnClass = isActive ? 'astryx-filter-btn astryx-filter-btn-active' : 'astryx-filter-btn';
            return (
              <AstryxButton
                key={strength}
                type="button"
                variant={isActive ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setFilterStrength(strength)}
                className={btnClass}
                aria-pressed={isActive}
              >
                {strength}
              </AstryxButton>
            );
          })}
        </div>

        <div className="astryx-candidate-selection-stats">
          <span className="astryx-selection-count-text">
            {selectedCandidateIds.length} of {candidates.length} selected
          </span>
          {onSelectAll && (
            <AstryxButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              className="astryx-action-link"
            >
              Select All
            </AstryxButton>
          )}
          {onClearSelection && selectedCandidateIds.length > 0 && (
            <AstryxButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="astryx-action-link astryx-action-link-muted"
            >
              Clear
            </AstryxButton>
          )}
        </div>
      </div>

      {/* Candidate Cards Grid */}
      <div className="astryx-candidate-cards-container">
        {filteredCandidates.map((candidate) => {
          const isSelected = selectedCandidateIds.includes(candidate.id);
          const strength = candidate.recommendationStrength || candidate.recommendation || 'Strong';
          const domain =
            candidate.domain ||
            candidate.type ||
            (candidate.couplingCluster ? `Cluster: ${candidate.couplingCluster}` : undefined) ||
            candidate.partition ||
            'Architecture';

          const files: string[] =
            candidate.files ||
            candidate.redundantComponents ||
            candidate.proposedTrack?.filesAffected ||
            [];

          const benefits = candidate.benefits || {
            locality: 'Encapsulates tightly coupled dependencies into an authoritative module.',
            depth: 'Reduces surface area while maximizing internal domain capabilities.',
            leverage: 'Propagates bug fixes and optimizations across all caller locations.'
          };

          const beforeDiag =
            candidate.beforeAfter?.beforeDiagram ||
            candidate.beforeArchitecture ||
            'flowchart TD\n  Dispersed["Direct inter-module coupling with cyclic dependencies"]';

          const afterDiag =
            candidate.beforeAfter?.afterDiagram ||
            candidate.afterArchitecture ||
            'flowchart TD\n  Golden["@superconductor/core golden source adapter"]';

          const beforeDesc =
            candidate.beforeAfter?.beforeDescription ||
            'Scattered, duplicate or tightly coupled logic across multiple subsystems.';

          const afterDesc =
            candidate.beforeAfter?.afterDescription ||
            'Single deep authoritative module reused across all callers.';

          const isDiagramExpanded = expandedDiagrams[candidate.id] !== false; // Default expanded for side-by-side view

          const cardSelectedClass = isSelected ? 'astryx-candidate-card-selected' : '';

          return (
            <AstryxCard
              key={candidate.id}
              className={`astryx-candidate-card ${cardSelectedClass}`.trim()}
              data-testid={`candidate-card-${candidate.id}`}
            >
              <div className="astryx-candidate-row">
                {/* Selection Checkbox */}
                <div className="astryx-candidate-checkbox-wrapper">
                  <AstryxCheckbox
                    checked={isSelected}
                    onChange={() => onToggleCandidate?.(candidate.id)}
                    aria-label={`Select ${candidate.title}`}
                    data-testid={`candidate-checkbox-${candidate.id}`}
                  />
                </div>

                {/* Candidate Content Body */}
                <div className="astryx-candidate-main">
                  {/* Title and Badges */}
                  <div className="astryx-candidate-header-row">
                    <div className="astryx-candidate-title-badges">
                      <h4 className="astryx-candidate-heading">{candidate.title}</h4>
                      <span className="astryx-domain-badge">{domain}</span>
                      <AstryxBadge strength={strength} />
                    </div>

                    <div className="astryx-candidate-meta-badges">
                      {candidate.couplingCluster && (
                        <span className="astryx-meta-tag">
                          {candidate.couplingCluster}
                        </span>
                      )}
                      {candidate.estimatedTokenSavings && (
                        <span className="astryx-savings-tag">
                          ⚡ Save ~{candidate.estimatedTokenSavings}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Problem Description */}
                  <p className="astryx-candidate-problem-desc">
                    {candidate.description}
                  </p>

                  {/* Affected Files List */}
                  {files.length > 0 && (
                    <div className="astryx-affected-files-container">
                      <span className="astryx-affected-files-title">
                        Affected Files ({files.length}):
                      </span>
                      {files.map((file) => (
                        <code key={file} className="astryx-affected-file-tag">
                          {file}
                        </code>
                      ))}
                    </div>
                  )}

                  {/* Solution & Benefits (Locality, Depth, Leverage) */}
                  <div className="astryx-benefits-grid">
                    <div className="astryx-benefit-card">
                      <div className="astryx-benefit-header">
                        <span className="astryx-benefit-icon" aria-hidden="true">📍</span>
                        <span className="astryx-benefit-title">Locality</span>
                      </div>
                      <p className="astryx-benefit-text">
                        {benefits.locality || 'Consolidates scattered module logic into a cohesive golden boundary.'}
                      </p>
                    </div>

                    <div className="astryx-benefit-card">
                      <div className="astryx-benefit-header">
                        <span className="astryx-benefit-icon" aria-hidden="true">🛡️</span>
                        <span className="astryx-benefit-title">Depth</span>
                      </div>
                      <p className="astryx-benefit-text">
                        {benefits.depth || benefits.testability || 'Encapsulates complex logic behind an ergonomic, narrow interface.'}
                      </p>
                    </div>

                    <div className="astryx-benefit-card">
                      <div className="astryx-benefit-header">
                        <span className="astryx-benefit-icon" aria-hidden="true">⚡</span>
                        <span className="astryx-benefit-title">Leverage</span>
                      </div>
                      <p className="astryx-benefit-text">
                        {benefits.leverage || 'Single implementation propagates bugfixes and improvements universally.'}
                      </p>
                    </div>
                  </div>

                  {/* Side-by-side Before / After Architecture Visualizer */}
                  <div className="astryx-visualizer-toggle-row">
                    <AstryxButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleDiagram(candidate.id)}
                      className="astryx-action-link"
                      aria-expanded={isDiagramExpanded}
                    >
                      {isDiagramExpanded ? '▼ Hide Architecture Comparison' : '▶ Show Architecture Comparison'}
                    </AstryxButton>
                  </div>

                  {isDiagramExpanded && (
                    <div className="astryx-arch-visualizer" data-testid="architecture-visualizer">
                      {/* Before Architecture Column */}
                      <div className="astryx-arch-column">
                        <div className="astryx-arch-header-before">
                          <span>BEFORE (Coupled / Redundant)</span>
                        </div>
                        <pre className="astryx-diagram-box astryx-diagram-box-before">
                          {beforeDiag}
                        </pre>
                        <p className="astryx-arch-description">{beforeDesc}</p>
                      </div>

                      {/* After Architecture Column */}
                      <div className="astryx-arch-column">
                        <div className="astryx-arch-header-after">
                          <span>AFTER (Deep / Golden Source)</span>
                        </div>
                        <pre className="astryx-diagram-box astryx-diagram-box-after">
                          {afterDiag}
                        </pre>
                        <p className="astryx-arch-description">{afterDesc}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </AstryxCard>
          );
        })}
      </div>
    </div>
  );
}
