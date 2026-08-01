import re

with open('packages/superconductor-core/src/permissions/track-state.ts', 'r') as f:
    content = f.read()

# find the last '}'
last_brace = content.rfind('}')
if last_brace != -1:
    new_content = content[:last_brace] + """
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
""" + content[last_brace+1:]
    with open('packages/superconductor-core/src/permissions/track-state.ts', 'w') as f:
        f.write(new_content)
