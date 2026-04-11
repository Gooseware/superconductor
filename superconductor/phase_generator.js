/**
 * Utility to dynamically generate and append new phases to a track's plan.md.
 */
export class PhaseGenerator {
  /**
   * Appends a new phase to the given markdown content.
   * @param {string} currentContent 
   * @param {string} phaseTitle 
   * @param {string[]} tasks 
   * @return {string}
   */
  appendPhase(currentContent, phaseTitle, tasks) {
    let result = currentContent.trimEnd();
    
    result += `\n\n## ${phaseTitle}\n`;
    for (const task of tasks) {
      result += `- [ ] Task: ${task}\n`;
    }
    
    return result;
  }
}
