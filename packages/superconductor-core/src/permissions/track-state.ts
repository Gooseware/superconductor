import * as fs from 'fs';
import * as path from 'path';
import { PermissionState } from './schemas';

export class TrackStateManager {
  private workspacePath: string;
  private tracksFilePath: string;
  private watcher: fs.FSWatcher | null = null;
  private isYolo: boolean = false;

  private cacheTime: number = 0;
  private cachedState: { state: PermissionState; activeTrackId: string | null } | null = null;
  private readonly CACHE_TTL = 200; // 200ms

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.tracksFilePath = path.join(this.workspacePath, 'superconductor', 'tracks.md');
    this.setupWatcher();
    this.loadSessionFlags();
  }

  private setupWatcher() {
    if (fs.existsSync(this.tracksFilePath)) {
      this.watcher = fs.watch(this.tracksFilePath, (eventType) => {
        if (eventType === 'change') {
          // Force re-read on next call
          this.cacheTime = 0;
        }
      });
    }
  }

  public setYolo(yolo: boolean, sessionId?: string, persist: boolean = false) {
    this.isYolo = yolo;
    if (persist && sessionId) {
      const configDir = path.join(this.workspacePath, '.superconductor');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      const flagsPath = path.join(configDir, 'session-flags.json');
      const tempPath = flagsPath + '.tmp';
      const flags = {
        yolo,
        activatedAt: new Date().toISOString(),
        sessionId,
        persistent: true
      };
      fs.writeFileSync(tempPath, JSON.stringify(flags, null, 2));
      fs.renameSync(tempPath, flagsPath);
    }
  }
  
  public loadSessionFlags() {
    const flagsPath = path.join(this.workspacePath, '.superconductor', 'session-flags.json');
    if (fs.existsSync(flagsPath)) {
      try {
        const data = fs.readFileSync(flagsPath, 'utf-8');
        const flags = JSON.parse(data);
        if (flags.yolo && flags.persistent) {
          this.isYolo = true;
        }
      } catch (e) {
        // ignore
      }
    }
  }


  private reevaluateState(): void {
    const now = Date.now();
    if (this.cachedState && now - this.cacheTime < this.CACHE_TTL) {
      return;
    }

    let activeTrackId: string | null = null;

    if (fs.existsSync(this.tracksFilePath)) {
      const content = fs.readFileSync(this.tracksFilePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('[~]')) {
          const match = line.match(/\[\~\]\s+([\w\/\-\.]+)/);
          if (match && match[1]) {
            activeTrackId = match[1].trim();
            break;
          }
        }
      }
    }

    let state: PermissionState = 'IDLE';
    if (this.isYolo) {
      state = 'YOLO';
    } else if (activeTrackId) {
      state = 'TRACKED';
    }

    this.cachedState = { state, activeTrackId };
    this.cacheTime = now;
  }

  public detectCurrentState(): PermissionState {
    this.reevaluateState();
    if (this.isYolo) return 'YOLO';
    return this.cachedState!.state;
  }

  public getActiveTrackId(): string | null {
    this.reevaluateState();
    return this.cachedState!.activeTrackId;
  }

  public dispose() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  public getStatusBanner(): string {
    const state = this.detectCurrentState();
    if (state === 'IDLE') {
      return `🟢 IDLE MODE: No restrictions active`;
    }
    if (state === 'YOLO') {
      return `⚠️ YOLO MODE: All restrictions bypassed — audit logging active`;
    }
    if (state === 'TRACKED') {
      const trackId = this.getActiveTrackId();
      return `🔒 TRACKED [${trackId}]: Scoped permissions active`;
    }
    return '';
  }
}

