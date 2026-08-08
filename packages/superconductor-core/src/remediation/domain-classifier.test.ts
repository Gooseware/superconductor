import { describe, it, expect } from 'vitest';
import { DomainClassifier } from './domain-classifier.js';

describe('DomainClassifier', () => {
  it('should map empty path to general-remediator', () => {
    const classifier = new DomainClassifier();
    expect(classifier.classify('')).toBe('general-remediator');
  });

  it('should map auth/jwt.ts to security-remediator', () => {
    const classifier = new DomainClassifier();
    expect(classifier.classify('auth/jwt.ts')).toBe('security-remediator');
  });

  it('should map ui/Button.tsx to frontend-remediator', () => {
    const classifier = new DomainClassifier();
    expect(classifier.classify('ui/Button.tsx')).toBe('frontend-remediator');
  });

  it('should map db/users.migration.ts to schema-remediator', () => {
    const classifier = new DomainClassifier();
    expect(classifier.classify('db/users.migration.ts')).toBe('schema-remediator');
  });

  it('should map api/routes/users.ts to api-remediator', () => {
    const classifier = new DomainClassifier();
    expect(classifier.classify('api/routes/users.ts')).toBe('api-remediator');
  });

  it('should map src/components/Button.test.ts to test-writer', () => {
    const classifier = new DomainClassifier();
    expect(classifier.classify('src/components/Button.test.ts')).toBe('test-writer');
  });

  it('should use custom domain map override that takes precedence over defaults', () => {
    const customMap = {
      'custom-auth-path/': 'custom-security-remediator',
      'auth/': 'overridden-security-remediator'
    };
    const classifier = new DomainClassifier(customMap);
    
    expect(classifier.classify('auth/jwt.ts')).toBe('overridden-security-remediator');
    expect(classifier.classify('custom-auth-path/file.ts')).toBe('custom-security-remediator');
  });

  it('should group findings by domain correctly', () => {
    const classifier = new DomainClassifier();
    const findings = [
      { id: '1', file: 'auth/jwt.ts' },
      { id: '2', file: 'middleware/auth.ts' },
      { id: '3', file: 'ui/Button.tsx' },
      { id: '4', file: 'unknown.ts' }
    ];

    const grouped = classifier.groupByDomain(findings);

    expect(grouped).toEqual({
      'security-remediator': [
        { id: '1', file: 'auth/jwt.ts' },
        { id: '2', file: 'middleware/auth.ts' }
      ],
      'frontend-remediator': [
        { id: '3', file: 'ui/Button.tsx' }
      ],
      'general-remediator': [
        { id: '4', file: 'unknown.ts' }
      ]
    });
  });
});
