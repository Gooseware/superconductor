import { describe, it, expect } from 'vitest';
import { parseDesignSchema } from '../src/verification/design-schema.js';

describe('DESIGN.md Schema Parser', () => {
  it('Parse a valid DESIGN.md into typed DesignSchema', () => {
    const markdown = `
# Design System

## Colors
- primary: #ff0000
- secondary: #00ff00

## Spacing
Base Unit: 4px
- small: 8px
- medium: 16px

## Typography
- h1: 32px / 40px / bold
- p: 16px / 24px / normal
    `;

    const schema = parseDesignSchema(markdown);
    
    expect(schema.colors.primary).toBe('#ff0000');
    expect(schema.colors.secondary).toBe('#00ff00');
    expect(schema.spacing.baseUnit).toBe(4);
    expect(schema.spacing.scale.medium).toBe(16);
    expect(schema.typography.scale.h1.fontSize).toBe('32px');
    expect(schema.typography.scale.h1.fontWeight).toBe('bold');
  });

  it('Reject DESIGN.md with missing required fields', () => {
    const invalidMarkdown = `
# Design System
## Colors
- primary: #ff0000
    `;

    expect(() => parseDesignSchema(invalidMarkdown)).toThrow(/Missing required design schema sections/);
  });
});
