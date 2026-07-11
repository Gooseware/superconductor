export interface ActionRequest {
  type: 'command' | 'file_write';
  command?: string;
  path?: string;
}

export interface RiskPolicyResponse {
  action: 'auto-approve' | 'require-approval' | 'block';
  tier: number;
}

export class RiskMiddleware {
  evaluate(request: ActionRequest): RiskPolicyResponse {
    if (request.type === 'command') {
      const cmd = request.command || '';
      if (cmd.includes('/etc/')) {
        return { action: 'block', tier: 5 };
      }
      if (cmd.startsWith('rm -rf')) {
        return { action: 'require-approval', tier: 3 };
      }
      if (cmd.startsWith('ls ') || cmd.startsWith('npm test')) {
        return { action: 'auto-approve', tier: 1 };
      }
      return { action: 'require-approval', tier: 2 };
    }

    if (request.type === 'file_write') {
      const p = request.path || '';
      if (p.startsWith('/etc/')) {
        return { action: 'block', tier: 5 };
      }
      if (p.includes('package.json')) {
        return { action: 'require-approval', tier: 3 };
      }
      if (p.startsWith('src/')) {
        return { action: 'auto-approve', tier: 2 };
      }
      return { action: 'require-approval', tier: 2 };
    }

    return { action: 'require-approval', tier: 3 };
  }
}
