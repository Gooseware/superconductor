export class TrackStateManager {
  constructor(private projectRoot: string) {}

  public getMode(): 'IDLE' | 'TRACKED' | 'YOLO' {
    // Basic mock implementation as requested
    if (process.env.SUPERCONDUCTOR_TRACK_ID) {
      return 'TRACKED';
    }
    if (process.env.SUPERCONDUCTOR_YOLO) {
      return 'YOLO';
    }
    return 'IDLE';
  }
}
