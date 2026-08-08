import re
with open('superconductor/tracks/swarm_remediation_20260809/plan.md', 'r') as f:
    content = f.read()

phase3_pattern = re.compile(r'(## Phase 3:.*?)(## Phase 4:)', re.DOTALL)
def replacer(match):
    text = match.group(1)
    text = text.replace('- [ ]', '- [x] (67e612e1)')
    text += "\n> [!checkpoint] Phase 3 completed.\n\n"
    return text + match.group(2)

content = phase3_pattern.sub(replacer, content)

with open('superconductor/tracks/swarm_remediation_20260809/plan.md', 'w') as f:
    f.write(content)
