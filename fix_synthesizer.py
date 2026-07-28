import re

with open("packages/engine/src/research/brief-synthesizer.ts", "r") as f:
    content = f.read()

# Replace llmMapSource fallback
content = re.sub(
    r"// Fallback for missing executeLlm logic in some tests[\s\S]*?];",
    "throw new Error('LLM did not return an array of findings');",
    content
)

# Replace llmReduceFindings fallback
content = re.sub(
    r"// Fallback[\s\S]*?};",
    "throw new Error('LLM did not return a valid synthesis object');",
    content
)

with open("packages/engine/src/research/brief-synthesizer.ts", "w") as f:
    f.write(content)
