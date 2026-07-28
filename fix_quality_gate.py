import re

with open("packages/engine/src/research/source-quality-gate.ts", "r") as f:
    content = f.read()

old_body = """  private evaluateGithub(source: ResearchSource): { passed: boolean; reason?: string } {
    if (source.stars === undefined || source.lastCommitDaysAgo === undefined || source.license === undefined) {
      return { passed: false, reason: 'Missing required metadata' };
    }
    if (source.stars < 100) {
      return { passed: false, reason: 'GitHub source must have >= 100 stars' };
    }
    if (source.lastCommitDaysAgo > 365) {
      return { passed: false, reason: 'GitHub source last commit must be <= 365 days ago' };
    }
    
    const allowedLicenses = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'];
    if (!allowedLicenses.includes(source.license)) {
      return { passed: false, reason: `GitHub source license must be one of: ${allowedLicenses.join(', ')}` };
    }

    return { passed: true };
  }"""

new_body = """  private evaluateGithub(source: ResearchSource): { passed: boolean; reason?: string } {
    if (!source.url) {
      return { passed: false, reason: 'URL is missing' };
    }

    try {
      const url = new URL(source.url);
      if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
        return { passed: false, reason: 'URL must belong to github.com' };
      }
    } catch (e) {
      return { passed: false, reason: 'Invalid URL' };
    }

    if (source.stars === undefined || source.lastCommitDaysAgo === undefined || source.license === undefined) {
      return { passed: false, reason: 'Missing required metadata' };
    }
    if (source.stars < 100) {
      return { passed: false, reason: 'GitHub source must have >= 100 stars' };
    }
    if (source.lastCommitDaysAgo > 365) {
      return { passed: false, reason: 'GitHub source last commit must be <= 365 days ago' };
    }
    
    const allowedLicenses = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'];
    if (!allowedLicenses.includes(source.license)) {
      return { passed: false, reason: `GitHub source license must be one of: ${allowedLicenses.join(', ')}` };
    }

    return { passed: true };
  }"""

content = content.replace(old_body, new_body)

with open("packages/engine/src/research/source-quality-gate.ts", "w") as f:
    f.write(content)
