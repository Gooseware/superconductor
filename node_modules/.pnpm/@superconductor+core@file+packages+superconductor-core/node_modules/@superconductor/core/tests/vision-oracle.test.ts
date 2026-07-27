import { VisionOracle, VisionOraclePayload } from '../src/review/vision-oracle.js';
import { describe, it, expect } from 'vitest';

describe('VisionOracle', () => {
  describe('buildPrompt', () => {
    it('should build a prompt including design tokens and component name', () => {
      const payload: VisionOraclePayload = {
        imagesBase64: ['base64string'],
        designTokens: {
          colors: {
            primary: '#FF0000'
          },
          effects: {
            glassmorphism: 'blur(10px)'
          }
        },
        componentName: 'LoginButton'
      };

      const prompt = VisionOracle.buildPrompt(payload);
      
      expect(prompt).toContain('for component: LoginButton');
      expect(prompt).toContain('"primary": "#FF0000"');
      expect(prompt).toContain('"glassmorphism": "blur(10px)"');
      expect(prompt).toContain('Astryx design tokens');
      expect(prompt).toContain('Missing glassmorphism effects');
    });

    it('should build a prompt without component name if not provided', () => {
      const payload: VisionOraclePayload = {
        imagesBase64: ['base64string'],
        designTokens: {
          spacing: {
            small: '8px'
          }
        }
      };

      const prompt = VisionOracle.buildPrompt(payload);
      
      expect(prompt).not.toContain('for component:');
      expect(prompt).toContain('"small": "8px"');
      expect(prompt).toContain('Astryx design tokens');
    });
  });

  describe('parseResponse', () => {
    it('should parse a valid JSON array response', () => {
      const llmResponse = `[
        {
          "severity": "critical",
          "description": "Wrong background color",
          "expected": "#F3F4F6",
          "actual": "#FFFFFF"
        }
      ]`;

      const findings = VisionOracle.parseResponse(llmResponse);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].description).toBe('Wrong background color');
      expect(findings[0].expected).toBe('#F3F4F6');
      expect(findings[0].actual).toBe('#FFFFFF');
    });

    it('should parse a JSON array wrapped in markdown json block', () => {
      const llmResponse = `\`\`\`json
[
  {
    "severity": "advisory",
    "description": "Missing glassmorphism"
  }
]
\`\`\``;

      const findings = VisionOracle.parseResponse(llmResponse);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('advisory');
      expect(findings[0].description).toBe('Missing glassmorphism');
    });

    it('should parse a JSON array wrapped in markdown block without language', () => {
      const llmResponse = `\`\`\`
[
  {
    "severity": "critical",
    "description": "Incorrect padding"
  }
]
\`\`\``;

      const findings = VisionOracle.parseResponse(llmResponse);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].description).toBe('Incorrect padding');
    });

    it('should throw an error if response is not valid JSON', () => {
      const llmResponse = `This is some text instead of json`;
      expect(() => VisionOracle.parseResponse(llmResponse)).toThrow(/Failed to parse Vision Oracle response/);
    });

    it('should throw an error if response is valid JSON but not an array', () => {
      const llmResponse = `{
        "severity": "critical",
        "description": "Wrong format"
      }`;
      expect(() => VisionOracle.parseResponse(llmResponse)).toThrow(/Response is not a JSON array/);
    });
  });
});
