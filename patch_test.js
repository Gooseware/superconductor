const fs = require('fs');
const file = '/home/gooseware/repos/gemini/extensions/superconductor/packages/superconductor-core/tests/intelligence/snapshot-reader.test.ts';
let content = fs.readFileSync(file, 'utf8');

const testCode = `
  describe('generateSyntheticContext', () => {
    it('generates synthetic product.md and tech-stack.md in superconductor/ directory', () => {
      const scDir = path.join(tempDir, 'superconductor');
      
      IntelligenceSnapshotReader.generateSyntheticContext(tempDir);

      expect(fs.existsSync(path.join(scDir, 'product.md'))).toBe(true);
      expect(fs.existsSync(path.join(scDir, 'tech-stack.md'))).toBe(true);
      
      const productContent = fs.readFileSync(path.join(scDir, 'product.md'), 'utf-8');
      const techStackContent = fs.readFileSync(path.join(scDir, 'tech-stack.md'), 'utf-8');
      
      expect(productContent.length).toBeGreaterThan(0);
      expect(techStackContent.length).toBeGreaterThan(0);
    });

    it('scrubs secrets, env vars, and credentials from generated output', () => {
      // Mock files in the repository that might be read to generate the context
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'Uses AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE and Password123!');
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: "test", secret: "super-secret-token-xyz" }));
      
      IntelligenceSnapshotReader.generateSyntheticContext(tempDir);

      const scDir = path.join(tempDir, 'superconductor');
      const techStackContent = fs.existsSync(path.join(scDir, 'tech-stack.md')) ? fs.readFileSync(path.join(scDir, 'tech-stack.md'), 'utf-8') : '';
      const productContent = fs.existsSync(path.join(scDir, 'product.md')) ? fs.readFileSync(path.join(scDir, 'product.md'), 'utf-8') : '';

      expect(techStackContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(productContent).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(techStackContent).not.toContain('super-secret-token-xyz');
      expect(productContent).not.toContain('super-secret-token-xyz');
    });
  });
`;

content = content.replace(/}\);\s*$/, testCode + '\n});\n');
fs.writeFileSync(file, content);
