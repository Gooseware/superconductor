import { DesignSchema } from './vlm-auditor.types.js';

export function parseDesignSchema(markdown: string): DesignSchema {
  const schema: DesignSchema = {
    colors: {},
    spacing: { baseUnit: 4, scale: {} },
    typography: { scale: {} },
    components: {}
  };

  const lines = markdown.split('\n');
  let currentSection = '';

  let hasColors = false;
  let hasSpacing = false;
  let hasTypography = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      currentSection = trimmed.substring(3).toLowerCase();
      if (currentSection === 'colors') hasColors = true;
      if (currentSection === 'spacing') hasSpacing = true;
      if (currentSection === 'typography') hasTypography = true;
      continue;
    }

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (currentSection === 'colors' && trimmed.startsWith('- ')) {
      const match = trimmed.match(/- (\w+): (#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})/);
      if (match) {
        schema.colors[match[1]] = match[2];
      }
    } else if (currentSection === 'spacing') {
      if (trimmed.startsWith('Base Unit:')) {
        const match = trimmed.match(/Base Unit: (\d+)px/);
        if (match) {
          schema.spacing.baseUnit = parseInt(match[1], 10);
        }
      } else if (trimmed.startsWith('- ')) {
        const match = trimmed.match(/- (\w+): (\d+)px/);
        if (match) {
          schema.spacing.scale[match[1]] = parseInt(match[2], 10);
        }
      }
    } else if (currentSection === 'typography' && trimmed.startsWith('- ')) {
      const match = trimmed.match(/- (\w+): (\d+px) \/ (\d+px) \/ (\w+|[0-9]+)/);
      if (match) {
        schema.typography.scale[match[1]] = {
          fontSize: match[2],
          lineHeight: match[3],
          fontWeight: match[4]
        };
      }
    }
  }

  if (!hasColors || !hasSpacing || !hasTypography) {
    throw new Error('Missing required design schema sections: Colors, Spacing, or Typography');
  }

  return schema;
}
