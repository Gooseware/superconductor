import { WorkUnit } from '@superconductor/core/src/track/work-unit.js';

export class ImplementorRegistry {
  private implementors = new Map<string, WorkUnit>();

  register(implementorId: string, workUnit: WorkUnit): void {
    this.implementors.set(implementorId, workUnit);
  }

  getWorkUnit(implementorId: string): WorkUnit | undefined {
    return this.implementors.get(implementorId);
  }

  getImplementorForFile(filePath: string): string | undefined {
    for (const [implementorId, workUnit] of this.implementors.entries()) {
      if (workUnit.domainScope.includes(filePath)) {
        return implementorId;
      }
    }
    return undefined;
  }
}
