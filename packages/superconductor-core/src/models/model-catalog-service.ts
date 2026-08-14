import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DiscoveredModel {
  id: string;
  name: string;
  description?: string;
}

export interface ModelCacheData {
  timestamp: number;
  models: DiscoveredModel[];
}

export interface ModelCatalogOptions {
  cachePath?: string;
  ttlMs?: number;
  cliTimeoutMs?: number;
  execCommand?: (cmd: string, timeoutMs: number) => string;
  execCommandAsync?: (cmd: string, timeoutMs: number) => Promise<string>;
}

export const DEFAULT_BUILTIN_MODELS: DiscoveredModel[] = [
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)' },
  { id: 'gemini-3.7-flash-medium', name: 'Gemini 3.7 Flash (Medium)' },
  { id: 'gemini-3.7-flash-low', name: 'Gemini 3.7 Flash (Low)' },
  { id: 'gemini-3.6-flash-high', name: 'Gemini 3.6 Flash (High)' },
  { id: 'gemini-3.6-flash-medium', name: 'Gemini 3.6 Flash (Medium)' },
  { id: 'gemini-3.6-flash-low', name: 'Gemini 3.6 Flash (Low)' },
  { id: 'gemini-3.5-flash-high', name: 'Gemini 3.5 Flash (High)' },
  { id: 'gemini-3.5-flash-medium', name: 'Gemini 3.5 Flash (Medium)' },
  { id: 'gemini-3.5-flash-low', name: 'Gemini 3.5 Flash (Low)' },
  { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
];

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_CLI_TIMEOUT_MS = 5000; // 5000ms

export class ModelCatalogService {
  private cachePath: string;
  private ttlMs: number;
  private cliTimeoutMs: number;
  private customExec?: (cmd: string, timeoutMs: number) => string;
  private customExecAsync?: (cmd: string, timeoutMs: number) => Promise<string>;

  constructor(options: ModelCatalogOptions = {}) {
    this.cachePath = options.cachePath || path.join(os.homedir(), '.gemini', 'models-cache.json');
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.cliTimeoutMs = options.cliTimeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;
    this.customExec = options.execCommand;
    this.customExecAsync = options.execCommandAsync;
  }

  /**
   * Returns the path to the models cache file.
   */
  public getCachePath(): string {
    return this.cachePath;
  }

  /**
   * Returns the fallback built-in models list.
   */
  public getBuiltinModels(): DiscoveredModel[] {
    return [...DEFAULT_BUILTIN_MODELS];
  }

  /**
   * Parses raw stdout from `agy models` extracting model IDs and display names.
   * Strips ANSI escape sequences, spinner lines, and whitespace variance.
   */
  public static parseAgyModelsOutput(output: string): DiscoveredModel[] {
    if (!output || typeof output !== 'string') {
      return [];
    }

    // Strip ANSI escape sequences
    const sanitized = output.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

    // Split by newlines and carriage returns
    const lines = sanitized.split(/\r?\n|\r/);
    const models: DiscoveredModel[] = [];
    const seenIds = new Set<string>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Filter out spinner or status messages
      if (line.includes('Fetching available models') || /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line)) {
        continue;
      }

      // Regex matching: ID at the start (letters, numbers, dots, hyphens, underscores),
      // followed by 2+ spaces (or 1+ space followed by uppercase/word char), followed by display name
      const match = line.match(/^([a-zA-Z0-9][a-zA-Z0-9_\.\-]*)\s{2,}(.+)$/) ||
                    line.match(/^([a-zA-Z0-9][a-zA-Z0-9_\.\-]+)\s+([A-Z0-9].*)$/);

      if (match) {
        const id = match[1].trim();
        const name = match[2].trim();
        if (id && name && !seenIds.has(id.toLowerCase())) {
          seenIds.add(id.toLowerCase());
          models.push({ id, name });
        }
      }
    }

    return models;
  }

  /**
   * Checks if the given cache data is valid and within the 24-hour TTL window.
   */
  public isCacheValid(cacheData: ModelCacheData | null): boolean {
    if (
      !cacheData ||
      typeof cacheData.timestamp !== 'number' ||
      !Array.isArray(cacheData.models) ||
      cacheData.models.length === 0
    ) {
      return false;
    }

    const age = Date.now() - cacheData.timestamp;
    return age >= 0 && age < this.ttlMs;
  }

  /**
   * Reads cache synchronously from the cache file.
   */
  public readCache(): ModelCacheData | null {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.timestamp === 'number' && Array.isArray(parsed.models)) {
        return parsed as ModelCacheData;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Writes models array to cache file with current timestamp.
   */
  public writeCache(models: DiscoveredModel[]): void {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: ModelCacheData = {
        timestamp: Date.now(),
        models,
      };
      fs.writeFileSync(this.cachePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Silently catch write errors to preserve system resilience
    }
  }

  /**
   * Removes the cache file if it exists.
   */
  public clearCache(): void {
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Executes `agy models` CLI command synchronously with timeout.
   */
  private execAgyModels(): string {
    if (this.customExec) {
      return this.customExec('agy models', this.cliTimeoutMs);
    }
    return child_process.execSync('agy models', {
      timeout: this.cliTimeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /**
   * Retrieves available models synchronously.
   * Checks cache first (<10ms). If cache is expired or forceRefresh is true,
   * invokes `agy models` via CLI with 5000ms timeout.
   * If CLI fails, falls back to existing cache or built-in models.
   */
  public getModels(options: { forceRefresh?: boolean } = {}): DiscoveredModel[] {
    const cached = this.readCache();

    if (!options.forceRefresh && this.isCacheValid(cached)) {
      return cached!.models;
    }

    try {
      const stdout = this.execAgyModels();
      const parsed = ModelCatalogService.parseAgyModelsOutput(stdout);
      if (parsed.length > 0) {
        this.writeCache(parsed);
        return parsed;
      }
    } catch {
      // CLI failed or timed out
    }

    // Fallback: cached data (even if expired) or built-in model array
    if (cached && cached.models && cached.models.length > 0) {
      return cached.models;
    }

    return this.getBuiltinModels();
  }

  /**
   * Forces a refresh of the models catalog via CLI.
   */
  public refresh(): DiscoveredModel[] {
    return this.getModels({ forceRefresh: true });
  }

  /**
   * Retrieves available models asynchronously.
   */
  public async getModelsAsync(options: { forceRefresh?: boolean } = {}): Promise<DiscoveredModel[]> {
    const cached = this.readCache();

    if (!options.forceRefresh && this.isCacheValid(cached)) {
      return cached!.models;
    }

    try {
      let stdout: string;
      if (this.customExecAsync) {
        stdout = await this.customExecAsync('agy models', this.cliTimeoutMs);
      } else if (this.customExec) {
        stdout = this.customExec('agy models', this.cliTimeoutMs);
      } else {
        stdout = await new Promise<string>((resolve, reject) => {
          child_process.exec(
            'agy models',
            { timeout: this.cliTimeoutMs, encoding: 'utf-8' },
            (err, out) => {
              if (err) return reject(err);
              resolve(out.toString());
            }
          );
        });
      }

      const parsed = ModelCatalogService.parseAgyModelsOutput(stdout);
      if (parsed.length > 0) {
        this.writeCache(parsed);
        return parsed;
      }
    } catch {
      // Fallback
    }

    if (cached && cached.models && cached.models.length > 0) {
      return cached.models;
    }

    return this.getBuiltinModels();
  }

  /**
   * Forces an asynchronous refresh of the models catalog.
   */
  public async refreshAsync(): Promise<DiscoveredModel[]> {
    return this.getModelsAsync({ forceRefresh: true });
  }
}
