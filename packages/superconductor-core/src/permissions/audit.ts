import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class YoloAuditLogger {
  private logFile: string;
  private fd: number = -1;
  private initialized = false;

  constructor(private workspacePath: string) {
    // realpathSync validates workspace is real, not a symlink chain
    const realWorkspace = fs.realpathSync(workspacePath);
    const logDir = path.join(realWorkspace, 'superconductor', 'logs');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    // lstatSync: does NOT follow symlinks — rejects symlinked logDir
    const logDirStat = fs.lstatSync(logDir);
    if (logDirStat.isSymbolicLink()) {
      throw new Error(`[YoloAuditLogger] Audit log directory is a symlink, refusing to use: ${logDir}`);
    }
    this.logFile = path.join(logDir, 'yolo-audit.log');
  }

  public init(): void {
    if (this.initialized) return;

    // O_NOFOLLOW: fails if final component is a symlink — prevents symlink substitution
    // O_CREAT | O_WRONLY | O_APPEND: create if absent, append-only
    // mode 0o600: owner-only at creation time (before umask; openSync respects explicit mode)
    const flags = fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW;
    try {
      this.fd = fs.openSync(this.logFile, flags, 0o600);
    } catch (err: any) {
      throw new Error(
        `[YoloAuditLogger] Cannot open audit log at ${this.logFile}: ${err.message}. ` +
        `Ensure the path exists, is not a symlink, and the process has write permission.`
      );
    }

    // fchmodSync(fd) — operates on the open file descriptor, zero TOCTOU window
    try {
      fs.fchmodSync(this.fd, 0o600);
    } catch (err: any) {
      fs.closeSync(this.fd); this.fd = -1;
      throw new Error(`[YoloAuditLogger] Cannot enforce 0o600 on audit log fd: ${err.message}.`);
    }

    // fstatSync(fd) — reads stats of the exact open file, no path re-resolution
    const stats = fs.fstatSync(this.fd);
    if ((stats.mode & 0o077) !== 0) {
      fs.closeSync(this.fd); this.fd = -1;
      throw new Error(
        `[YoloAuditLogger] Audit log permissions too open: 0o${(stats.mode & 0o777).toString(8)}. ` +
        `Expected 0o600. Remove group/other bits and restart.`
      );
    }

    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized) this.init();
  }

  private writeEntry(entry: object): void {
    this.ensureInitialized();
    // writeSync(fd) — no path re-resolution, no symlink follow possible
    fs.writeSync(this.fd, JSON.stringify(entry) + '\n');
  }

  public logToolCall(tool: string, args: any, sessionId: string): void {
    const argsHash = crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex');
    this.writeEntry({ timestamp: new Date().toISOString(), mode: 'YOLO', tool, argsHash, sessionId, bypass: true });
  }

  public logOverride(choice: string, tool: string, args: any): void {
    const argsHash = crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex');
    this.writeEntry({ timestamp: new Date().toISOString(), event: 'INLINE_OVERRIDE', choice, tool, argsHash });
  }

  public close(): void {
    if (this.fd !== -1) { fs.closeSync(this.fd); this.fd = -1; this.initialized = false; }
  }
}
