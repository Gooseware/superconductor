import * as fs from 'fs';
import * as path from 'path';

export interface AgentConfigResearchOptions {
    authMode?: 'apiKey' | 'vertexai';
    [key: string]: any;
}

export class AgentConfigReader {
    static getResearchProviderConfig(workspaceDir: string): { providerName: string; options: AgentConfigResearchOptions } | undefined {
        const configPath = path.join(workspaceDir, '.superconductor', 'agent-config.md');
        if (!fs.existsSync(configPath)) {
            return undefined;
        }

        const content = fs.readFileSync(configPath, 'utf8');
        const providerMatch = content.match(/Research Provider:\s*([^\r\n]+)/i);
        if (!providerMatch) {
            return undefined;
        }

        let providerName = providerMatch[1].trim();
        // Normalize dashes to underscores for internal registry compatibility
        providerName = providerName.replace(/-/g, '_');

        const options: AgentConfigResearchOptions = {};
        
        const authModeMatch = content.match(/Auth Mode:\s*([^\r\n]+)/i);
        if (authModeMatch) {
            options.authMode = authModeMatch[1].trim() as 'apiKey' | 'vertexai';
        }

        return { providerName, options };
    }
}
