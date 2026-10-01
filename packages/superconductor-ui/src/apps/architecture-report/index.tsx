import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, ArchitectureReportAppProps } from './App.js';

export * from './App.js';
export * from './types.js';
export { CandidateList, Skeleton as CandidateListSkeleton } from './components/CandidateList.js';
export type {
  CandidateListProps,
  CandidateItem,
  ArchitectureCandidateBenefit,
  ArchitectureCandidateBeforeAfter,
  ArchitectureProposedTrack
} from './components/CandidateList.js';

export { TrackGenerator, Skeleton as TrackGeneratorSkeleton } from './components/TrackGenerator.js';
export type { TrackGeneratorProps } from './components/TrackGenerator.js';

/**
 * Mounts the Architecture Report React application to a DOM container element.
 * @param container The DOM HTMLElement where the app should be rendered
 * @param props Optional properties to customize data and theme
 * @returns A teardown function to unmount the application
 */
export function mountArchitectureReport(
  container: HTMLElement,
  props?: ArchitectureReportAppProps
): () => void {
  const root = createRoot(container);
  root.render(<App {...props} />);
  return () => {
    root.unmount();
  };
}

export default App;
