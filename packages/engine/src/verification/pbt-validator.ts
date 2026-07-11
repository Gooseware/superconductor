import { PbtValidationResult, PropertyDefinition } from './pbt.types.js';

export function validatePbtUsage(
  fileContent: string,
  targetModuleId: string,
  inScopeModules: string[]
): PbtValidationResult {
  const isInScope = inScopeModules.includes(targetModuleId);

  if (!isInScope) {
    return {
      passed: true,
      moduleId: targetModuleId,
      propertiesFound: [],
      feedback: []
    };
  }

  const hasFastCheckImport = /import\s+.*\s+from\s+['"]fast-check['"]/.test(fileContent);
  const propertiesFound: PropertyDefinition[] = [];
  const feedback: string[] = [];

  if (hasFastCheckImport) {
    // Simple regex to find fc.property usages. 
    // In a real implementation, we would use an AST parser.
    const propertyRegex = /fc\.property\(/g;
    let match;
    while ((match = propertyRegex.exec(fileContent)) !== null) {
      propertiesFound.push({
        name: 'Detected Property',
        description: 'Auto-detected fast-check property',
        generators: [] // Would require AST parsing to extract generators accurately
      });
    }
  }

  const passed = propertiesFound.length > 0;

  if (!passed) {
    feedback.push('No fast-check properties found. Please use property-based testing for this module.');
  }

  return {
    passed,
    moduleId: targetModuleId,
    propertiesFound,
    feedback
  };
}
