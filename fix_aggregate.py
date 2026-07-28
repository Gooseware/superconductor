import re

with open("packages/superconductor-core/src/review/aggregate-findings.ts", "r") as f:
    content = f.read()

# Replace class signature
content = content.replace(
    "export class KeyholeContextManager<T extends { domain?: string; researchContext?: string }> {",
    "export class KeyholeContextManager<T extends { domainScope?: string[]; researchContext?: string }> {"
)

# Replace injectResearchContext body
old_body = """  public injectResearchContext(workUnit: T, brief: any): void {
    const domain = workUnit.domain;
    if (!domain) return;
    
    const filteredFindings = (brief.keyFindings || []).filter((f: any) => 
      f.domain === domain || f.category === domain
    );
    
    let contextAddition = '';
    if (brief.executiveSummary) {
      contextAddition += `Executive Summary:\\n${brief.executiveSummary}\\n\\n`;
    }
    
    if (filteredFindings.length > 0) {
      contextAddition += `Domain Findings (${domain}):\\n`;
      contextAddition += JSON.stringify(filteredFindings, null, 2);
    }
    
    if (contextAddition) {
      workUnit.researchContext = (workUnit.researchContext ? workUnit.researchContext + '\\n\\n' : '') + contextAddition.trim();
    }
  }"""

new_body = """  public injectResearchContext(workUnit: T, brief: any): void {
    const domainScope = workUnit.domainScope;
    if (!domainScope || !Array.isArray(domainScope) || domainScope.length === 0) return;
    
    const filteredFindings = (brief.keyFindings || []).filter((f: any) => 
      domainScope.includes(f.domain) || domainScope.includes(f.category)
    );
    
    let contextAddition = '';
    if (brief.executiveSummary) {
      contextAddition += `Executive Summary:\\n${brief.executiveSummary}\\n\\n`;
    }
    
    if (filteredFindings.length > 0) {
      contextAddition += `Domain Findings (${domainScope.join(', ')}):\\n`;
      contextAddition += JSON.stringify(filteredFindings, null, 2);
    }
    
    if (contextAddition) {
      const sanitized = sanitizeUntrustedText(contextAddition.trim());
      const safeContext = `<untrusted_research_context>\\n${sanitized}\\n</untrusted_research_context>`;
      workUnit.researchContext = (workUnit.researchContext ? workUnit.researchContext + '\\n\\n' : '') + safeContext;
    }
  }"""

content = content.replace(old_body, new_body)

with open("packages/superconductor-core/src/review/aggregate-findings.ts", "w") as f:
    f.write(content)
