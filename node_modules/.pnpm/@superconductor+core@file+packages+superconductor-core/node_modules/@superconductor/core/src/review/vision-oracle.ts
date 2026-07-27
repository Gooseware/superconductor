export interface VisionOraclePayload {
  imagesBase64: string[];
  designTokens: Record<string, any>;
  componentName?: string;
}

export interface UIReviewFinding {
  severity: 'critical' | 'advisory';
  description: string;
  expected?: string;
  actual?: string;
}

export class VisionOracle {
  /**
   * Generates a strict system prompt instructing the LLM to verify UI screenshots against Astryx design tokens.
   */
  static buildPrompt(payload: VisionOraclePayload): string {
    const tokensJson = JSON.stringify(payload.designTokens, null, 2);
    const componentContext = payload.componentName ? ` for component: ${payload.componentName}` : '';
    
    return `You are the Superconductor Vision Oracle. Your task is to perform a strict multi-modal UI review.
You will receive base64 encoded screenshots of a UI implementation${componentContext}.

Your objective is to meticulously verify the UI's compliance against the provided Astryx design tokens.

ASTRYX DESIGN TOKENS:
\`\`\`json
${tokensJson}
\`\`\`

INSTRUCTIONS:
1. Analyze the provided screenshots carefully.
2. Cross-reference visual elements (colors, typography, spacing, padding, borders, and effects like glassmorphism) with the Astryx design tokens.
3. Identify ANY deviations from the design tokens. Flag them as UI findings.
   - Example: Wrong hex colors (e.g., background #FFFFFF instead of token #F3F4F6).
   - Example: Incorrect padding (e.g., appears 8px instead of token 16px).
   - Example: Missing glassmorphism effects (e.g., no background-blur or transparency).
4. Output your findings as a strict JSON array of objects, using the following schema:
   [
     {
       "severity": "critical" | "advisory",
       "description": "string",
       "expected": "string (optional)",
       "actual": "string (optional)"
     }
   ]
5. Only return the JSON array. Do not include any other text, markdown formatting (like \`\`\`json), or explanations.`;
  }

  /**
   * Parses the LLM JSON response into structured UIReviewFinding objects.
   * Handles cases where the LLM might include markdown backticks.
   */
  static parseResponse(llmResponse: string): UIReviewFinding[] {
    let cleanResponse = llmResponse.trim();
    if (cleanResponse.startsWith('\`\`\`json')) {
      cleanResponse = cleanResponse.replace(/^\`\`\`json/, '');
      cleanResponse = cleanResponse.replace(/\`\`\`$/, '');
    } else if (cleanResponse.startsWith('\`\`\`')) {
      cleanResponse = cleanResponse.replace(/^\`\`\`/, '');
      cleanResponse = cleanResponse.replace(/\`\`\`$/, '');
    }
    
    try {
      const parsed = JSON.parse(cleanResponse.trim());
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not a JSON array');
      }
      return parsed as UIReviewFinding[];
    } catch (e) {
      throw new Error(`Failed to parse Vision Oracle response: ${(e as Error).message}`);
    }
  }
}
