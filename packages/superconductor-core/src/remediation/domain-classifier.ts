export interface Finding {
  file?: string;
  [key: string]: any;
}

export class DomainClassifier {
  constructor(customMap?: Record<string, string>) {
  }

  classify(filePath: string): string {
    return 'general-remediator';
  }

  groupByDomain(findings: Finding[]): Record<string, Finding[]> {
    return {};
  }
}
