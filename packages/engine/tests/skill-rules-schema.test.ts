import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Skill Rules Schema', () => {
  const schemaPath = path.join(process.cwd(), '../../superconductor/schema/skill-rules.schema.json');

  it('should exist and be valid JSON', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    const content = fs.readFileSync(schemaPath, 'utf8');
    const json = JSON.parse(content);
    expect(json.title).toBe('SuperconductorSkillRules');
    expect(json.required).toContain('triggers');
    expect(json.required).toContain('metadata');
  });

  it('should validate example skill-rules object structure', () => {
    const example = {
      version: '1.0',
      triggers: {
        keywords: ['refactor', 'code review'],
        fileGlobs: ['**/*.ts'],
        intentPatterns: ['^review.*'],
        executionEvents: ['UserPromptSubmit']
      },
      metadata: {
        name: 'review',
        marketplace: '1p',
        version: '1.0.0'
      }
    };

    expect(example.version).toMatch(/^[0-9]+\.[0-9]+$/);
    expect(example.metadata.marketplace).toBe('1p');
    expect(Array.isArray(example.triggers.keywords)).toBe(true);
  });
});
