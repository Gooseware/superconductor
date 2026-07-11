export interface PropertyDefinition {
  name: string;
  description: string;
  generators: string[];
}

export interface PbtValidationResult {
  passed: boolean;
  moduleId: string;
  propertiesFound: PropertyDefinition[];
  feedback: string[];
}

export interface PbtEvent {
  subType: 'pbt_validation';
  timestamp: number;
  taskId: string;
  moduleId: string;
  result: PbtValidationResult;
}
