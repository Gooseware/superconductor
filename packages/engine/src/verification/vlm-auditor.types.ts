export interface DesignSchema {
  colors: Record<string, string>;
  spacing: {
    baseUnit: number;
    scale: Record<string, number>;
  };
  typography: {
    scale: Record<string, { fontSize: string; lineHeight: string; fontWeight: string | number }>;
  };
  components: Record<string, any>;
}

export interface VisualDiff {
  elementSelector: string;
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AuditResult {
  passed: boolean;
  score: number; // 0-100
  diffs: VisualDiff[];
  suggestions: string[];
}

export interface AuditEvent {
  subType: 'vlm_audit';
  timestamp: number;
  taskId: string;
  componentName: string;
  result: AuditResult;
}
