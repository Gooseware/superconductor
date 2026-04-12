export class ProjectConfigAnalyzer {
  constructor(fs = null) {
    this.fs = fs;
  }

  analyze(techStackPath, packageJsonPath) {
    this.config = {};
    if (this.fs.existsSync(packageJsonPath)) {
      const content = this.fs.readFileSync(packageJsonPath, 'utf8');
      const pkg = JSON.parse(content);
      this.config.scripts = pkg.scripts || {};
    }
    if (this.fs.existsSync(techStackPath)) {
      const content = this.fs.readFileSync(techStackPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes('production:') || line.toLowerCase().includes('prod:')) {
          const match = line.match(/`(.+?)`/);
          if (match) this.config.prodDeploy = match[1];
        }
        if (line.toLowerCase().includes('staging:') || line.toLowerCase().includes('dev:')) {
          const match = line.match(/`(.+?)`/);
          if (match) this.config.stagingDeploy = match[1];
        }
      }
    }
  }

  suggestDeploymentCommand(targetBranch) {
    const scripts = this.config.scripts || {};
    if (targetBranch === 'main' || targetBranch === 'master') {
      if (this.config.prodDeploy) return this.config.prodDeploy;
      const prodKey = Object.keys(scripts).find(k => k.includes('deploy') && (k.includes('prod') || k.includes('main')));
      if (prodKey) return `npm run ${prodKey}`;
    }
    if (targetBranch === 'dev' || targetBranch === 'develop') {
      if (this.config.stagingDeploy) return this.config.stagingDeploy;
      const devKey = Object.keys(scripts).find(k => k.includes('deploy') && (k.includes('staging') || k.includes('dev')));
      if (devKey) return `npm run ${devKey}`;
    }
    return null;
  }
}
