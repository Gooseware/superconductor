export type ToolSurface = 'full' | 'readonly';

export class ToolSurfaceFilter {
  private readOnlyDeniedTools: Set<string> = new Set([
    'write_to_file',
    'replace_file_content',
    'multi_replace_file_content',
    'run_command'
  ]);

  public isAllowed(surface: ToolSurface | undefined, toolName: string): boolean {
    if (surface === 'readonly') {
      return !this.readOnlyDeniedTools.has(toolName);
    }
    return true;
  }
}
