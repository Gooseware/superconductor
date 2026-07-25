import * as fs from 'fs';
import * as path from 'path';
import { IntelligenceSnapshotReader } from './snapshot-reader.js';

export function getDependencySurface(projectRoot: string, depName?: string): Record<string, number> {
  const intelDir = path.join(projectRoot, 'superconductor', 'intelligence');
  const filePath = path.join(intelDir, '08_dependency_surface.json');

  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const loaded = IntelligenceSnapshotReader.load(intelDir, projectRoot);
    const map = loaded?.dependencySurfaceMap;

    if (depName) {
      const score = map ? map.get(depName) : undefined;
      return { [depName]: score ?? 0 };
    }

    if (map) {
      return Object.fromEntries(map.entries());
    }

    return {};
  } catch (e) {
    return {};
  }
}

