import re

with open("packages/superconductor-core/tests/keyhole-context-manager.test.ts", "r") as f:
    content = f.read()

content = content.replace("workUnit = { domain: 'auth'", "workUnit = { domainScope: ['auth']")
content = content.replace("domain is not set", "domainScope is not set")
content = content.replace("expect(workUnit.researchContext).toContain('Executive Summary:\\nAuth needs to be secure.');", "expect(workUnit.researchContext).toContain('Executive Summary:\\nAuth needs to be secure.');")
content = content.replace("expect(workUnit.researchContext).toContain('Domain Findings (auth):');", "expect(workUnit.researchContext).toContain('Domain Findings (auth):');")
content = content.replace("expect(workUnit.researchContext).toContain('Original context.');", "expect(workUnit.researchContext).toContain('Original context.');")
content = content.replace("expect(workUnit.researchContext).toContain('Missing token validation');", "expect(workUnit.researchContext).toContain('Missing token validation');")

# Note: The output is wrapped in <untrusted_research_context> and sanitized.
# The original test checked exact strings. We don't need to change expect(...).toContain(...) for the inner content since it still contains it!
# Wait, let's just make sure we change domain to domainScope everywhere.
content = content.replace("workUnit as any", "workUnit as any")

with open("packages/superconductor-core/tests/keyhole-context-manager.test.ts", "w") as f:
    f.write(content)
