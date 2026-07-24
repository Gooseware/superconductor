import * as fs from 'fs';
import * as path from 'path';

export function getDependencySurface(projectRoot: string, depName?: string): Record<string, number> {
  const intelDir = path.join(projectRoot, 'superconductor', 'intelligence');
  const filePath = path.join(intelDir, '08_dependency_surface.json');

  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const heatmap = data.heatmap || {};

    if (depName) {
      return { [depName]: heatmap[depName] || 0 };
    }

    return heatmap;
  } catch (e) {
    return {};
  }
}
