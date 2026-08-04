export interface ResearchSource {
  type?: string;
  url: string;
  stars?: number;
  lastCommitDaysAgo?: number;
  license?: string;
  [key: string]: any;
}

export class ResearchSourceQualityGate {
  evaluate(source: ResearchSource): { passed: boolean; reason?: string } {
    if (!source || !source.type) {
      return { passed: false, reason: 'Invalid source object' };
    }

    switch (source.type) {
      case 'github':
        return this.evaluateGithub(source);
      case 'paper':
        return this.evaluatePaper(source);
      case 'community':
        return this.evaluateCommunity(source);
      default:
        return { passed: false, reason: 'Unknown source type' };
    }
  }

  private evaluateGithub(source: ResearchSource): { passed: boolean; reason?: string } {
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
  }

  private evaluatePaper(source: ResearchSource): { passed: boolean; reason?: string } {
    if (!source.url) {
      return { passed: false, reason: 'URL is missing' };
    }

    try {
      const url = new URL(source.url);
      const host = url.hostname;
      const allowedDomains = ['arxiv.org', 'aclweb.org', 'nips.cc', 'neurips.cc', 'openreview.net'];
      
      const isAllowed = allowedDomains.some(domain => host === domain || host.endsWith('.' + domain));
      if (!isAllowed) {
        return { passed: false, reason: 'Paper URL must be from an allowed domain' };
      }
      return { passed: true };
    } catch (e) {
      return { passed: false, reason: 'Invalid URL' };
    }
  }

  private evaluateCommunity(source: ResearchSource): { passed: boolean; reason?: string } {
    if (!source.url) {
      return { passed: false, reason: 'URL is missing' };
    }

    try {
      const url = new URL(source.url);
      const host = url.hostname;
      const exactDomains = ['github.com', 'stackoverflow.com', 'developer.mozilla.org', 'docs.github.com', 'docs.docker.com'];
      
      let isAllowed = exactDomains.some(domain => host === domain || host.endsWith('.' + domain));
      
      if (!isAllowed) {
        return { passed: false, reason: 'Community URL must be from an allowed domain' };
      }
      return { passed: true };
    } catch (e) {
      return { passed: false, reason: 'Invalid URL' };
    }
  }
}
