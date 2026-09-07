import * as fs from 'fs';
import * as path from 'path';

export interface AgentConfigResearchOptions {
    authMode?: 'apiKey' | 'vertexai';
    mode?: 'pro' | 'ultra' | 'standard' | 'flash';
    endpoint?: string;
    [key: string]: any;
}

export class AgentConfigReader {
    static getResearchProviderConfig(workspaceDir: string): { providerName: string; options: AgentConfigResearchOptions } | undefined {
        let configPath = path.join(workspaceDir, '.superconductor', 'agent-config.md');
        if (!fs.existsSync(configPath)) {
            configPath = path.join(workspaceDir, 'superconductor', 'agent-config.md');
            if (!fs.existsSync(configPath)) {
                return undefined;
            }
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
        const providerMatch = content.match(/(?:^|\n)\s*(?:Research Provider|researchProvider|research_provider):\s*['"]?([^'"\r\n]+)['"]?/i);
        if (!providerMatch) {
            return undefined;
        }

        let providerName = providerMatch[1].trim();

        const options: AgentConfigResearchOptions = {};
        
        const authModeMatch = content.match(/(?:^|\n)\s*(?:Auth Mode|authMode|auth_mode):\s*['"]?([^'"\r\n]+)['"]?/i);
        if (authModeMatch) {
            const mode = authModeMatch[1].trim();
            if (mode !== 'apiKey' && mode !== 'vertexai') {
                throw new Error("Invalid authMode: must be 'apiKey' or 'vertexai'");
            }
            options.authMode = mode as 'apiKey' | 'vertexai';
        }

        const deerflowModeMatch = content.match(/(?:^|\n)\s*(?!Auth)(?:Deerflow Mode|deerflowMode|deerflow_mode|mode):\s*['"]?([^'"\r\n]+)['"]?/i);
        if (deerflowModeMatch) {
            options.mode = deerflowModeMatch[1].trim() as 'pro' | 'ultra' | 'standard' | 'flash';
        }

        const deerflowEndpointMatch = content.match(/(?:^|\n)\s*(?:Deerflow Endpoint|deerflowEndpoint|deerflow_endpoint|endpoint):\s*['"]?([^'"\r\n]+)['"]?/i);
        if (deerflowEndpointMatch) {
            options.endpoint = deerflowEndpointMatch[1].trim();
        }

        return { providerName, options };
    }

    static getResearchMode(workspaceDir: string): 'auto' | 'deerflow-preferred' | 'gemini-preferred' | 'internal-only' | undefined {
        let configPath = path.join(workspaceDir, '.superconductor', 'agent-config.md');
        if (!fs.existsSync(configPath)) {
            configPath = path.join(workspaceDir, 'superconductor', 'agent-config.md');
            if (!fs.existsSync(configPath)) {
                return undefined;
            }
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

        const modeMatch = content.match(/(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?(?:Research Mode|researchMode|research_mode)(?:\*\*)?:\s*[`'"]?([^`'"\r\n#]+)[`'"]?/i);
        if (modeMatch) {
            const raw = modeMatch[1].trim().toLowerCase();
            if (['auto', 'deerflow-preferred', 'gemini-preferred', 'internal-only'].includes(raw)) {
                return raw as 'auto' | 'deerflow-preferred' | 'gemini-preferred' | 'internal-only';
            }
        }
        return undefined;
    }
}

