import { describe, it, expect } from 'vitest';
import { validatePbtUsage } from '../src/verification/pbt-validator.js';

describe('PBT Validator', () => {
  it('Accept test file using fast-check property assertions', () => {
    const fileContent = `
      import * as fc from 'fast-check';
      import { myFunction } from './my-function';

      test('myFunction property', () => {
        fc.assert(
          fc.property(fc.string(), (str) => {
            expect(myFunction(str)).toBe(str.length);
          })
        );
      });
    `;

    const result = validatePbtUsage(fileContent, 'src/my-function.ts', ['src/my-function.ts']);
    
    expect(result.passed).toBe(true);
    expect(result.propertiesFound.length).toBeGreaterThan(0);
    expect(result.feedback.length).toBe(0);
  });

  it('Reject test file with only example-based assertions for in-scope module', () => {
    const fileContent = `
      import { myFunction } from './my-function';

      test('myFunction example', () => {
        expect(myFunction('abc')).toBe(3);
      });
    `;

    const result = validatePbtUsage(fileContent, 'src/my-function.ts', ['src/my-function.ts']);
    
    expect(result.passed).toBe(false);
    expect(result.propertiesFound.length).toBe(0);
    expect(result.feedback[0]).toContain('No fast-check properties found');
  });

  it('Out-of-scope modules are not flagged', () => {
    const fileContent = `
      import { uiComponent } from './ui';

      test('ui example', () => {
        expect(uiComponent()).toBeTruthy();
      });
    `;

    const result = validatePbtUsage(fileContent, 'src/ui.ts', ['src/my-function.ts']);
    
    expect(result.passed).toBe(true);
    expect(result.propertiesFound.length).toBe(0);
  });
});
