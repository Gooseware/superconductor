import { ConflictReport } from '../types/concurrency.types';

export interface AccessResult {
  success: boolean;
  conflicts: ConflictReport[];
}

export class StormController {
  private fileOwners: Map<string, string> = new Map();
  private conflicts: Map<string, ConflictReport> = new Map();

  requestAccess(taskId: string, files: string[]): AccessResult {
    const currentConflicts: ConflictReport[] = [];
    let hasConflict = false;

    // Check for conflicts
    for (const file of files) {
      const owner = this.fileOwners.get(file);
      if (owner && owner !== taskId) {
        hasConflict = true;
        
        let conflict = this.conflicts.get(file);
        if (!conflict) {
          conflict = {
            file,
            conflictingTasks: [owner],
            resolved: false
          };
          this.conflicts.set(file, conflict);
        }
        
        if (!conflict.conflictingTasks.includes(taskId)) {
          conflict.conflictingTasks.push(taskId);
        }
        conflict.resolved = false;
        
        currentConflicts.push(conflict);
      }
    }

    if (hasConflict) {
      return {
        success: false,
        conflicts: currentConflicts
      };
    }

    // Grant access
    for (const file of files) {
      this.fileOwners.set(file, taskId);
    }

    return {
      success: true,
      conflicts: []
    };
  }

  releaseAccess(taskId: string): void {
    for (const [file, owner] of Array.from(this.fileOwners.entries())) {
      if (owner === taskId) {
        this.fileOwners.delete(file);
        
        const conflict = this.conflicts.get(file);
        if (conflict) {
          conflict.resolved = true;
        }
      }
    }
  }

  getConflictReport(): ConflictReport[] {
    return Array.from(this.conflicts.values());
  }
}
