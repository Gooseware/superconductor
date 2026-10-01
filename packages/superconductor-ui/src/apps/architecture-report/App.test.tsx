import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App.js';

describe('Architecture Report App', () => {
  it('renders without crashing and displays header and title', () => {
    render(<App />);
    expect(screen.getByText('Astryx Architecture Report')).toBeDefined();
    expect(
      screen.getByText('Superconductor DRY Refactoring Swarm & Deepening Intelligence')
    ).toBeDefined();
  });

  it('displays all 4 summary metrics', () => {
    render(<App />);

    expect(screen.getByText('Total Partitions')).toBeDefined();
    expect(screen.getByText('Candidate Deepenings')).toBeDefined();
    expect(screen.getByText('Potential Token Savings')).toBeDefined();
    expect(screen.getByText('Non-DRY Redundancies')).toBeDefined();

    // Default numeric values
    expect(screen.getByText('8')).toBeDefined();
    expect(screen.getByText('14')).toBeDefined();
    expect(screen.getByText('~42.5k (28.4%)')).toBeDefined();
    expect(screen.getByText('19')).toBeDefined();
  });

  it('provides Astryx theme context and allows toggling theme', () => {
    const { container } = render(<App defaultTheme="dark" />);
    const rootElement = container.querySelector('[data-astryx-theme]');
    expect(rootElement).not.toBeNull();
    expect(rootElement?.getAttribute('data-astryx-theme')).toBe('dark');

    // Click theme toggle button
    const toggleButton = screen.getByRole('button', { name: /switch to light mode/i });
    expect(toggleButton).toBeDefined();
    fireEvent.click(toggleButton);

    expect(rootElement?.getAttribute('data-astryx-theme')).toBe('light');
  });

  it('embeds Candidate List and displays candidates with Astryx recommendation badges', () => {
    render(<App />);

    expect(screen.getByText('Architectural Refactoring Candidates')).toBeDefined();
    expect(screen.getByText('Consolidate DAG Execution Types')).toBeDefined();
    expect(screen.getByText('Encapsulate Reviewer Response Broker')).toBeDefined();
    expect(screen.getByText('Unify Mock & Production Agent Spawners')).toBeDefined();

    // Check badges (they also appear in filter buttons, so getAllByText is used)
    const strongBadges = screen.getAllByText('Strong');
    expect(strongBadges.length).toBeGreaterThanOrEqual(2);

    const exploringBadges = screen.getAllByText('Worth exploring');
    expect(exploringBadges.length).toBeGreaterThanOrEqual(2);

    const speculativeBadges = screen.getAllByText('Speculative');
    expect(speculativeBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('embeds Track Generator and updates command when selecting candidates', () => {
    render(<App />);

    expect(screen.getByText('Track Generator')).toBeDefined();
    const generateButton = screen.getByRole('button', { name: /generate superconductor tracks/i });
    expect(generateButton).toBeDefined();

    // Check that CLI command is displayed
    const commandText = screen.getByText(/superconductor track create/i);
    expect(commandText).toBeDefined();
    expect(commandText.textContent).toContain('dag-types-adapter');
  });

  it('accepts custom initialData props', () => {
    render(
      <App
        initialData={{
          metrics: {
            totalPartitions: 4,
            candidateDeepenings: 7,
            potentialTokenSavings: '15k',
            nonDryRedundancies: 5
          },
          candidates: [
            {
              id: 'custom-candidate-1',
              title: 'Custom Refactoring Test',
              description: 'Custom test description',
              recommendation: 'Strong',
              partition: 'Partition Alpha',
              couplingCluster: 'cluster-alpha',
              estimatedTokenSavings: '5k',
              redundantComponents: ['alpha.ts']
            }
          ]
        }}
      />
    );

    expect(screen.getByText('Custom Refactoring Test')).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('15k')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
  });
});
