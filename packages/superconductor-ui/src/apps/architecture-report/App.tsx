import React, { useState } from 'react';
import {
  AstryxThemeProvider,
  AstryxLayout,
  AstryxCard,
  AstryxThemeMode
} from '../../components/astryx/index.js';
import { CandidateList } from './components/CandidateList.js';
import { TrackGenerator } from './components/TrackGenerator.js';
import { ArchitectureReportData, SummaryMetrics, RefactoringCandidate } from './types.js';

const defaultMetrics: SummaryMetrics = {
  totalPartitions: 8,
  candidateDeepenings: 14,
  potentialTokenSavings: '~42.5k (28.4%)',
  nonDryRedundancies: 19
};

const defaultCandidates: RefactoringCandidate[] = [
  {
    id: 'dag-types-adapter',
    title: 'Consolidate DAG Execution Types',
    description: 'Merge duplicate DAG interface declarations between engine/src/types/dag.types.ts and superconductor-core.',
    recommendation: 'Strong',
    partition: 'Partition 1: Core Engine & Graph Scheduler',
    couplingCluster: 'cluster-engine-dag',
    estimatedTokenSavings: '8.4k',
    redundantComponents: ['dag.types.ts', 'scheduler.types.ts'],
    beforeArchitecture: 'engine/types/dag.types.ts <--> superconductor-core (Cyclic import hazard)',
    afterArchitecture: 'Golden Source: @superconductor/core/types/dag'
  },
  {
    id: 'reviewer-broker-adapter',
    title: 'Encapsulate Reviewer Response Broker',
    description: 'Decouple Quorum reviewer response broking from direct filesystem mutations using an encapsulated adapter.',
    recommendation: 'Strong',
    partition: 'Partition 2: Quorum FSM & Review Loop',
    couplingCluster: 'cluster-quorum-broker',
    estimatedTokenSavings: '12.1k',
    redundantComponents: ['reviewer-response-broker.ts', 'quorum-store.ts'],
    beforeArchitecture: 'Direct FS access in reviewer-response-broker.ts across 4 subsystems',
    afterArchitecture: 'Superconductor Adapter pattern with event emitter hooks'
  },
  {
    id: 'agent-spawner-unification',
    title: 'Unify Mock & Production Agent Spawners',
    description: 'Shared spawn orchestration interface across mock-agent-spawner.ts and agy-agent-spawner.ts.',
    recommendation: 'Worth exploring',
    partition: 'Partition 3: Agent Dispatch & Lifecycle',
    couplingCluster: 'cluster-spawner-cli',
    estimatedTokenSavings: '9.2k',
    redundantComponents: ['mock-agent-spawner.ts', 'agy-agent-spawner.ts'],
    beforeArchitecture: 'Duplicated child_process wrapper logic in CLI and harness handlers',
    afterArchitecture: 'Unified AgentSpawnerAdapter with mockable provider plugin'
  },
  {
    id: 'astryx-component-primitives',
    title: 'Migrate Ad-hoc React Components to Astryx Registry',
    description: 'Replace fragmented UI buttons and cards in cli/dashboard with Golden Source Astryx primitives.',
    recommendation: 'Speculative',
    partition: 'Partition 4: Frontend & Reporting Surface',
    couplingCluster: 'cluster-ui-components',
    estimatedTokenSavings: '12.8k',
    redundantComponents: ['MockButton.tsx', 'legacy-report.html'],
    beforeArchitecture: 'Ad-hoc CSS class soup without OKLCH token isolation',
    afterArchitecture: 'Standardized @superconductor/ui Astryx component tree'
  }
];

export interface ArchitectureReportAppProps {
  initialData?: Partial<ArchitectureReportData>;
  defaultTheme?: AstryxThemeMode;
}

const ArchitectureReportAppContent: React.FC<{
  data: ArchitectureReportData;
}> = ({ data }) => {
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([
    'dag-types-adapter',
    'reviewer-broker-adapter'
  ]);

  const toggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedCandidateIds(data.candidates.map((c) => c.id));
  };

  const clearSelection = () => {
    setSelectedCandidateIds([]);
  };

  const metrics = data.metrics;

  return (
    <AstryxLayout
      title="Astryx Architecture Report"
      subtitle="Superconductor DRY Refactoring Swarm & Deepening Intelligence"
    >
      <div className="astryx-report-content">
        {/* Metric Cards Grid - 2:1 Label Ratio (Design Heuristics Rule 7) */}
        <section aria-label="Summary Metrics">
          <div className="astryx-metrics-grid">
            {/* Metric 1: Total Partitions */}
            <AstryxCard padding="md" className="metric-card">
              <div className="astryx-metric-card-inner">
                <span className="astryx-metric-label">
                  Total Partitions
                </span>
                <span className="astryx-metric-value">
                  {metrics.totalPartitions}
                </span>
                <span className="astryx-metric-subtext">
                  Workspace dependency partitions
                </span>
              </div>
            </AstryxCard>

            {/* Metric 2: Candidate Deepenings */}
            <AstryxCard padding="md" className="metric-card">
              <div className="astryx-metric-card-inner">
                <span className="astryx-metric-label">
                  Candidate Deepenings
                </span>
                <span className="astryx-metric-value astryx-metric-value-primary">
                  {metrics.candidateDeepenings}
                </span>
                <span className="astryx-metric-subtext">
                  Opportunities for DRY encapsulation
                </span>
              </div>
            </AstryxCard>

            {/* Metric 3: Potential Token Savings */}
            <AstryxCard padding="md" className="metric-card">
              <div className="astryx-metric-card-inner">
                <span className="astryx-metric-label">
                  Potential Token Savings
                </span>
                <span className="astryx-metric-value astryx-metric-value-success">
                  {metrics.potentialTokenSavings}
                </span>
                <span className="astryx-metric-subtext">
                  Across Swarm agent prompt loops
                </span>
              </div>
            </AstryxCard>

            {/* Metric 4: Non-DRY Redundancies */}
            <AstryxCard padding="md" className="metric-card">
              <div className="astryx-metric-card-inner">
                <span className="astryx-metric-label">
                  Non-DRY Redundancies
                </span>
                <span className="astryx-metric-value astryx-metric-value-danger">
                  {metrics.nonDryRedundancies}
                </span>
                <span className="astryx-metric-subtext">
                  Reinvented or duplicate symbols
                </span>
              </div>
            </AstryxCard>
          </div>
        </section>

        {/* Section 2: Refactoring Candidates */}
        <section aria-label="Refactoring Candidates">
          <div className="astryx-section-header">
            <h2 className="astryx-section-title">
              Architectural Refactoring Candidates
            </h2>
            <p className="astryx-section-subtitle">
              Review prioritized candidates generated by the Intelligence Swarm. Check candidates to include in track generation.
            </p>
          </div>

          <CandidateList
            candidates={data.candidates}
            selectedCandidateIds={selectedCandidateIds}
            onToggleCandidate={toggleCandidate}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
          />
        </section>

        {/* Section 3: Track Generator */}
        <section aria-label="Track Generator">
          <TrackGenerator
            candidates={data.candidates}
            selectedCandidateIds={selectedCandidateIds}
          />
        </section>
      </div>
    </AstryxLayout>
  );
};

export function App({
  initialData,
  defaultTheme = 'dark'
}: ArchitectureReportAppProps) {
  const fullData: ArchitectureReportData = {
    metrics: { ...defaultMetrics, ...initialData?.metrics },
    candidates: initialData?.candidates || defaultCandidates,
    lastScanTimestamp: initialData?.lastScanTimestamp
  };

  return (
    <AstryxThemeProvider defaultTheme={defaultTheme}>
      <ArchitectureReportAppContent data={fullData} />
    </AstryxThemeProvider>
  );
}

export default App;

