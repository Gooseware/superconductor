import { CacheHitReport } from './cache.types.js';

export interface CacheManagerConfig {
  maxTokenBudget: number;
}

export interface Payload {
  taskId: string;
  systemInstruction: string;
  tools: string;
  context: string;
}

interface CacheEntry {
  prefix: string;
  tokens: number;
  lastUsedAt: number;
}

export class CacheManager {
  private config: CacheManagerConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private currentUsage: number = 0;

  constructor(config: CacheManagerConfig) {
    this.config = config;
  }

  public findCommonPrefix(str1: string, str2: string): string {
    let i = 0;
    while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
      i++;
    }
    return str1.substring(0, i);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  public processPayload(payload: Payload): CacheHitReport {
    const prefixString = payload.systemInstruction + (payload.tools ? '\n' + payload.tools : '');
    
    const existing = this.cache.get(prefixString);
    if (existing) {
      existing.lastUsedAt = Date.now();
      const totalTokens = this.estimateTokens(prefixString + '\n' + payload.context);
      return {
        hitRatio: existing.tokens / totalTokens,
        estimatedTokenSavings: existing.tokens,
        invalidatedSegments: []
      };
    }

    const tokens = this.estimateTokens(prefixString);
    this.cachePrefix(prefixString, tokens);

    return {
      hitRatio: 0,
      estimatedTokenSavings: 0,
      invalidatedSegments: []
    };
  }

  private cachePrefix(prefix: string, tokens: number) {
    this.currentUsage += tokens;
    this.cache.set(prefix, {
      prefix,
      tokens,
      lastUsedAt: Date.now()
    });

    this.evictIfNeeded();
  }

  private evictIfNeeded() {
    if (this.currentUsage <= this.config.maxTokenBudget) return;

    const entries = Array.from(this.cache.values()).sort((a, b) => a.lastUsedAt - b.lastUsedAt);

    for (const entry of entries) {
      if (this.currentUsage <= this.config.maxTokenBudget) break;
      
      this.cache.delete(entry.prefix);
      this.currentUsage -= entry.tokens;
    }
  }

  public getCurrentTokenUsage(): number {
    return this.currentUsage;
  }

  public hasCached(prefix: string): boolean {
    return this.cache.has(prefix);
  }
}
