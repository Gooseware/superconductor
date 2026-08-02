import fs from "fs";
import path from "path";

export type TrackMode = 'IDLE' | 'TRACKED' | 'YOLO';

export class TrackStateManager {
  private mode: TrackMode = 'TRACKED';
  private filePath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath;
    } else {
      const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
      this.filePath = path.join(PROJECT_ROOT, "superconductor", "logs", "track-state.json");
    }
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(content);
        if (['IDLE', 'TRACKED', 'YOLO'].includes(parsed.mode)) {
          this.mode = parsed.mode;
        }
      }
    } catch (err) {
      console.error(`Failed to load track state from ${this.filePath}:`, err);
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify({ mode: this.mode }, null, 2), "utf-8");
    } catch (err) {
      console.error(`Failed to save track state to ${this.filePath}:`, err);
    }
  }

  getMode(): TrackMode {
    return this.mode;
  }

  setMode(mode: TrackMode): void {
    this.mode = mode;
    this.save();
  }
}
