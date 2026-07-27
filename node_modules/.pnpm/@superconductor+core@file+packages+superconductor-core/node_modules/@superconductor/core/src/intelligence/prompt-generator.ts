import { z } from 'zod';
import { DependencyContextManager } from './dependency-context.js';

export const PackageVettingMatrixSchema = z.object({
    licenseCompliance: z.boolean().describe('Whether the package license is compliant with the project'),
    cves: z.array(z.string()).describe('List of CVEs if any'),
    maintenanceMetrics: z.object({
        lastCommit: z.string().optional(),
        openIssues: z.number().optional(),
        contributors: z.number().optional()
    }).optional(),
    bundleSize: z.number().optional().describe('Bundle size in bytes')
});

export type PackageVettingMatrix = z.infer<typeof PackageVettingMatrixSchema>;

export function GenerateResearchPrompt(workspaceDir: string, basePrompt: string, dependencyManager?: DependencyContextManager): string {
    const manager = dependencyManager || new DependencyContextManager();
    const deps = manager.getDependencies(workspaceDir);
    
    const validPrompt = (basePrompt && typeof basePrompt === 'string') ? basePrompt : '';
    
    const depsString = deps && Object.keys(deps).length > 0 
        ? JSON.stringify(deps, null, 2) 
        : '{}';

    return `
${validPrompt}

=== CONTEXT ===
Installed Packages:
${depsString}

=== INSTRUCTIONS ===
CRITICAL: The deep research agent MUST operate in a strict read-only capacity. You are NOT allowed to modify any files, execute code that changes state, or deploy anything.
`.trim();
}
