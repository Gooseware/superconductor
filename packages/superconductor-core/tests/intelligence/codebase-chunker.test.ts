import { describe, it, expect, vi } from 'vitest';
import { CodebaseChunker } from '../../src/intelligence/codebase-chunker';
import { DependencyAnalyzer } from '../../src/intelligence/dependency-analyzer';

describe('CodebaseChunker', () => {
  it('should group files into a single chunk if within token limit', async () => {
    const analyzer = new DependencyAnalyzer();
    const mockFiles: Record<string, string> = {
      'src/main.ts': `import { utils } from './utils';\nconsole.log(utils());`,
      'src/utils.ts': `export const utils = () => 'utils';`,
    };
    
    analyzer.setFileReader((filePath) => mockFiles[filePath] || '');
    
    // Naive token counter: 1 character = 1 token for testing
    const tokenCounter = (text: string) => text.length;
    
    const chunker = new CodebaseChunker(analyzer, tokenCounter, 100000);
    const chunks = await chunker.chunkFiles(Object.keys(mockFiles));
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].files).toContain('src/main.ts');
    expect(chunks[0].files).toContain('src/utils.ts');
  });

  it('should enforce 100k token cap and split by dependencies', async () => {
    const analyzer = new DependencyAnalyzer();
    const mockFiles: Record<string, string> = {
      'src/app.ts': `import { a } from './feature-a';\nimport { b } from './feature-b';`,
      'src/feature-a.ts': `import { a_util } from './a_util';\n// ` + 'A'.repeat(60000), // 60k tokens
      'src/a_util.ts': `// ` + 'A'.repeat(10000), // 10k tokens
      'src/feature-b.ts': `import { b_util } from './b_util';\n// ` + 'B'.repeat(60000), // 60k tokens
      'src/b_util.ts': `// ` + 'B'.repeat(10000), // 10k tokens
    };
    
    analyzer.setFileReader((filePath) => mockFiles[filePath] || '');
    const tokenCounter = (text: string) => text.length;
    
    // Max 100k tokens per chunk
    const chunker = new CodebaseChunker(analyzer, tokenCounter, 100000);
    const chunks = await chunker.chunkFiles(Object.keys(mockFiles));
    
    // feature-a (60k) + a_util (10k) = 70k, fits in one chunk
    // feature-b (60k) + b_util (10k) = 70k, fits in another chunk
    // app.ts is small, can go anywhere or its own
    
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    
    // Verify each chunk is under the 100k limit
    for (const chunk of chunks) {
      let totalTokens = 0;
      for (const file of chunk.files) {
        totalTokens += tokenCounter(mockFiles[file]);
      }
      expect(totalTokens).toBeLessThanOrEqual(100000);
    }
  });

  it('should split oversized chunks by secondary dependency boundary', async () => {
    const analyzer = new DependencyAnalyzer();
    // Imagine a single dependency chain where the total exceeds 100k
    // main -> large1 (60k) -> large2 (60k)
    const mockFiles: Record<string, string> = {
      'src/main.ts': `import { l1 } from './large1';`,
      'src/large1.ts': `import { l2 } from './large2';\n// ` + 'L'.repeat(60000),
      'src/large2.ts': `// ` + 'L'.repeat(60000),
    };
    
    analyzer.setFileReader((filePath) => mockFiles[filePath] || '');
    const tokenCounter = (text: string) => text.length;
    
    const chunker = new CodebaseChunker(analyzer, tokenCounter, 100000);
    const chunks = await chunker.chunkFiles(Object.keys(mockFiles));
    
    expect(chunks.length).toBe(2);
    
    for (const chunk of chunks) {
      let totalTokens = 0;
      for (const file of chunk.files) {
        totalTokens += tokenCounter(mockFiles[file]);
      }
      expect(totalTokens).toBeLessThanOrEqual(100000);
    }
    
    // Ensure large1 and large2 are separated since together they are 120k
    const chunk1Files = chunks[0].files;
    const chunk2Files = chunks[1].files;
    
    const large1In1 = chunk1Files.includes('src/large1.ts');
    const large2In1 = chunk1Files.includes('src/large2.ts');
    expect(large1In1 && large2In1).toBe(false);
  });
});
