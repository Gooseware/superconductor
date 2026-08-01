export const ANTI_PATTERNS: Record<string, Record<string, string[]>> = {
  typescript: {
    security: ['eval(', 'innerHTML', 'dangerouslySetInnerHTML'],
    correctness: ['any', 'ts-ignore', 'as unknown'],
    adversarial: ['echo "no tests yet"', 'exit 0']
  },
  python: {
    security: ['exec(', 'eval(', 'pickle.loads('],
    correctness: ['except Exception: pass'],
    adversarial: ['def test_.*():\\s*pass']
  },
  go: {
    security: ['unsafe.Pointer'],
    correctness: ['panic('],
    adversarial: ['t.Skip()']
  },
  rust: {
    security: ['unsafe {'],
    correctness: ['unwrap()', 'expect('],
    adversarial: ['todo!()']
  },
  unknown: {
    security: [],
    correctness: [],
    adversarial: []
  }
};
