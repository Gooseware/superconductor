import * as fs from 'fs';
import { SessionFlags, SessionFlagsSchema } from '../schemas';

export class SessionProvider {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public read(): SessionFlags | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return SessionFlagsSchema.parse(parsed);
    } catch (e) {
      console.error('Failed to parse session flags:', e);
      return null;
    }
  }

  public write(flags: SessionFlags): void {
    const tmpPath = `${this.filePath}.tmp`;
    const jsonString = JSON.stringify(flags, null, 2);
    
    // Atomic write pattern: write to tmp file then rename
    fs.writeFileSync(tmpPath, jsonString, 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }
}
