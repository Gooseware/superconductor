import re

with open("packages/engine/src/research/brief-synthesizer.ts", "r") as f:
    content = f.read()

old_code = "this.executeLlm = executeLlm || (async () => ({}));"
new_code = """this.executeLlm = executeLlm || (async (prompt: string) => {
      if (prompt.includes('Extract')) return [];
      if (prompt.includes('Synthesize')) return { executiveSummary: 'Mock', recommendedPatterns: [], antiPatterns: [] };
      return {};
    });"""

content = content.replace(old_code, new_code)

with open("packages/engine/src/research/brief-synthesizer.ts", "w") as f:
    f.write(content)
