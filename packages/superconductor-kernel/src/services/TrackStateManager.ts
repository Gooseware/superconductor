export type TrackMode = 'IDLE' | 'TRACKED' | 'YOLO';

export class TrackStateManager {
  private mode: TrackMode = 'TRACKED';

  getMode(): TrackMode {
    return this.mode;
  }

  setMode(mode: TrackMode): void {
    this.mode = mode;
  }
}
