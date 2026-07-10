export interface PluginInfo {
  name: string;
  description?: string;
  capabilities: string[];
}

export interface ToolAllowlist {
  allowedPlugins: string[];
}

export interface TrimResult {
  disabledPlugins: string[];
  flags: string; // e.g. "--disable-plugin=foo --disable-plugin=bar"
  estimatedTokenSavings: number;
}
