import re

with open('packages/superconductor-core/src/permissions/track-state.ts', 'r') as f:
    content = f.read()

# Replace setYolo method
old_set_yolo = """  public setYolo(yolo: boolean) {
    this.isYolo = yolo;
  }"""

new_set_yolo = """  public setYolo(yolo: boolean, sessionId?: string, persist: boolean = false) {
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
"""

# Also need to call loadSessionFlags in constructor
old_constructor = """  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.tracksFilePath = path.join(this.workspacePath, 'superconductor', 'tracks.md');
    this.setupWatcher();
  }"""

new_constructor = """  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.tracksFilePath = path.join(this.workspacePath, 'superconductor', 'tracks.md');
    this.setupWatcher();
    this.loadSessionFlags();
  }"""

content = content.replace(old_set_yolo, new_set_yolo)
content = content.replace(old_constructor, new_constructor)

with open('packages/superconductor-core/src/permissions/track-state.ts', 'w') as f:
    f.write(content)
