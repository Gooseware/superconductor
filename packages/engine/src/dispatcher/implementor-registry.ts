import { WorkUnit } from '@superconductor/core/src/track/work-unit.js';

export class ImplementorRegistry {
  private implementors = new Map<string, WorkUnit>();

  register(implementorId: string, workUnit: WorkUnit): void {
    for (const [existingId, existingWu] of this.implementors.entries()) {
      if (existingId !== implementorId) {
        for (const newScope of workUnit.domainScope) {
          for (const existingScope of existingWu.domainScope) {
            if (newScope.startsWith(existingScope) || existingScope.startsWith(newScope)) {
              throw new Error(`Architectural Drift: Overlapping domain scope detected between ${implementorId} and ${existingId} for scopes: ${newScope}, ${existingScope}`);
            }
          }
        }
      }
    }
    this.implementors.set(implementorId, workUnit);
  }

  getWorkUnit(implementorId: string): WorkUnit | undefined {
    return this.implementors.get(implementorId);
  }

  getImplementorForFile(filePath: string): string | undefined {
    for (const [implementorId, workUnit] of this.implementors.entries()) {
      if (workUnit.domainScope.some((scope: string) => filePath.startsWith(scope))) {
        return implementorId;
      }
    }
    return undefined;
  }
}
