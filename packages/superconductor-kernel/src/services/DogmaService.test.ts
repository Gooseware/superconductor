import { DogmaService } from './DogmaService.js';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('DogmaService - Lifecycle & SSR Safety', () => {
  let dogmaService: DogmaService;
  let tempDir: string;

  beforeEach(async () => {
    dogmaService = new DogmaService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dogma-test-'));
  });

  async function createTestFile(content: string) {
    const filePath = path.join(tempDir, 'TestComponent.tsx');
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it('should flag useEffect without cleanup when listener is added', async () => {
    const code = `
      import { useEffect } from 'react';
      export const Component = () => {
        useEffect(() => {
          window.addEventListener('resize', () => {});
        }, []);
        return <div>Test</div>;
      };
    `;
    const filePath = await createTestFile(code);
    const result = await dogmaService.validate(filePath);
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Missing cleanup function in useEffect'))).toBe(true);
  });

  it('should pass useEffect with cleanup', async () => {
    const code = `
      import { useEffect } from 'react';
      export const Component = () => {
        useEffect(() => {
          const handler = () => {};
          window.addEventListener('resize', handler);
          return () => window.removeEventListener('resize', handler);
        }, []);
        return <div>Test</div>;
      };
    `;
    const filePath = await createTestFile(code);
    const result = await dogmaService.validate(filePath);
    expect(result.success).toBe(true);
  });

  it('should flag direct window access outside of useEffect', async () => {
    const code = `
      const width = window.innerWidth;
      export const Component = () => <div>{width}</div>;
    `;
    const filePath = await createTestFile(code);
    const result = await dogmaService.validate(filePath);
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Direct access to window/document detected outside of safe boundaries'))).toBe(true);
  });

  it('should allow window access inside typeof check', async () => {
    const code = `
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      export const Component = () => <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
    `;
    const filePath = await createTestFile(code);
    const result = await dogmaService.validate(filePath);
    expect(result.success).toBe(true);
  });

  it('should flag missing image dimensions', async () => {
    const code = `
      export const Component = () => <img src="test.jpg" />;
    `;
    const filePath = await createTestFile(code);
    const result = await dogmaService.validate(filePath);
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes('Missing explicit dimensions or aspect-ratio'))).toBe(true);
  });

  it('should flag missing keyboard accessibility on div onClick', async () => {
    const code = `
      export const Component = () => <div onClick={() => {}} role="button">Click me</div>;
    `;
    const filePath = await createTestFile(code);
    const result = await dogmaService.validate(filePath);
    expect(result.success).toBe(false);
    expect(result.errors.some((e: string) => e.includes('missing onKeyDown or tabIndex'))).toBe(true);
  });

  it('should suggest skeleton for complex components', async () => {
    const code = `
      export const Component = ({ items }: { items: string[] }) => (
        <div>
          {items.map(item => <div key={item}>{item}</div>)}
        </div>
      );
    `;
    const filePath = await createTestFile(code);
    const result = await dogmaService.validate(filePath);
    expect(result.suggestions?.some((s: string) => s.includes('missing a Skeleton export'))).toBe(true);
  });
});
