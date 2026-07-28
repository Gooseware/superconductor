import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchQueryFormulator } from '../../src/research/query-formulator';

describe('ResearchQueryFormulator', () => {
  let formulator: ResearchQueryFormulator;

  beforeEach(() => {
    formulator = new ResearchQueryFormulator();
  });

  it('always produces >=5 queries (one per dimension)', () => {
    const trackDescription = 'Implement a highly scalable distributed caching system using Redis';
    const queries = formulator.formulate(trackDescription);
    
    expect(queries.length).toBeGreaterThanOrEqual(5);
    
    const dimensions = queries.map(q => q.dimension);
    expect(dimensions).toContain('OSS');
    expect(dimensions).toContain('academic');
    expect(dimensions).toContain('ecosystem');
    expect(dimensions).toContain('SC_skills');
    expect(dimensions).toContain('community');
  });

  it('never exceeds maxQueries', () => {
    const trackDescription = 'Simple task';
    const queries = formulator.formulate(trackDescription, 6);
    expect(queries.length).toBe(6);
  });

  it('throws an error if maxQueries is less than 5', () => {
    expect(() => {
      formulator.formulate('Short task', 4);
    }).toThrowError(/maxQueries must be at least 5/);
  });
});
