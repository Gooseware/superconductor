/**
 * Logic to detect when a review should be triggered based on various inputs.
 */
export class ReviewTriggerDetector {
  /**
   * Checks if a commit message contains the review trigger.
   * @param {string} commitMessage 
   * @return {boolean}
   */
  isTriggeredByCommit(commitMessage) {
    return commitMessage.toLowerCase().includes('ready-for-review');
  }

  /**
   * Checks if a CLI command is a review command.
   * @param {string} command 
   * @return {boolean}
   */
  isTriggeredByCommand(command) {
    return command.trim() === '/superconductor:review';
  }

  /**
   * Checks if the plan.md content contains a task marked for review.
   * @param {string} planContent 
   * @return {boolean}
   */
  isTriggeredByPlan(planContent) {
    return planContent.includes('(READY FOR REVIEW)');
  }
}
