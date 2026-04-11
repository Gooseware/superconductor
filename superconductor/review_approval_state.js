/**
 * States for the review approval process.
 * @enum {string}
 */
const States = {
  PENDING: 'PENDING',
  ORACLE_APPROVED: 'ORACLE_APPROVED',
  USER_APPROVED: 'USER_APPROVED',
  REJECTED: 'REJECTED',
};

/**
 * Manager for tracking and transitioning the approval state of a track review.
 */
export class ReviewApprovalState {
  constructor() {
    /** @private {string} */
    this.state = States.PENDING;
  }

  /**
   * Returns current state.
   * @return {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Transitions to a new state based on the event.
   * @param {string} event 
   */
  transition(event) {
    switch (event) {
      case 'ORACLE_APPROVE':
        if (this.state === States.PENDING) {
          this.state = States.ORACLE_APPROVED;
        }
        break;
      case 'ORACLE_REJECT':
        this.state = States.REJECTED;
        break;
      case 'USER_APPROVE':
        if (this.state === States.ORACLE_APPROVED) {
          this.state = States.USER_APPROVED;
        }
        break;
      case 'USER_REJECT':
        this.state = States.REJECTED;
        break;
      default:
        break;
    }
  }

  /**
   * Resets the state back to PENDING.
   */
  reset() {
    this.state = States.PENDING;
  }

  /**
   * Returns true if the review process is complete and approved.
   * @return {boolean}
   */
  isApproved() {
    return this.state === States.USER_APPROVED;
  }
}
