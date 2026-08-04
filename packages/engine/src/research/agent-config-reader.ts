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

        let content = '';
        try {
            content = fs.readFileSync(configPath, 'utf8');
        } catch (e: any) {
            if (e.code === 'ENOENT' || e.code === 'EISDIR') {
                return undefined;
            }
            throw e;
        }
        const providerMatch = content.match(/Research Provider:\s*([^\r\n]+)/i);
        if (!providerMatch) {
            return undefined;
        }

        let providerName = providerMatch[1].trim();
        // The registry handles format variations natively
        

        const options: AgentConfigResearchOptions = {};
        
        const authModeMatch = content.match(/Auth Mode:\s*([^\r\n]+)/i);
        if (authModeMatch) {
            const mode = authModeMatch[1].trim();
            if (mode !== 'apiKey' && mode !== 'vertexai') {
                throw new Error("Invalid authMode: must be 'apiKey' or 'vertexai'");
            }
            options.authMode = mode as 'apiKey' | 'vertexai';
        }

        return { providerName, options };
    }
}
