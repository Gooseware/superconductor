import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

const AGENTS_DIR = path.join(os.homedir(), '.gemini/config/plugins/superconductor/agents');

const READ_TOOLS = [
    "send_message", "find_by_name", "grep_search", "view_file", "list_dir",
    "read_url_content", "search_web", "schedule", "generate_image",
    "manage_task", "notebook_edit"
];
const RUN_TOOLS = ["run_command"];
const WRITE_TOOLS = ["multi_replace_file_content", "replace_file_content", "write_to_file"];
const FULL_TOOLS = [...READ_TOOLS, ...RUN_TOOLS, ...WRITE_TOOLS];

const ROLES = {
    "adversarial-reviewer": "read-only",
    "correctness-reviewer": "read-only",
    "regression-reviewer": "read-only",
    "security-reviewer": "read-only",
    "superconductor-reviewer": "read-only",
    "superconductor-oracle": "read+run",
    "superconductor-processor": "full",
    "superconductor-dreamer": "write+run",
    "remediation-processor": "write+run"
} as Record<string, string>;

function getRequiredTools(role: string): string[] {
    if (role === "read-only") return READ_TOOLS;
    if (role === "read+run") return [...READ_TOOLS, ...RUN_TOOLS];
    if (role === "full" || role === "write+run") return FULL_TOOLS;
    return [];
}

describe('Agent Manifests Audit', () => {
    const agents = fs.readdirSync(AGENTS_DIR).filter(d => {
        const stat = fs.statSync(path.join(AGENTS_DIR, d));
        return stat.isDirectory() && fs.existsSync(path.join(AGENTS_DIR, d, 'agent.md'));
    });

    for (const agent of agents) {
        describe(`Agent: ${agent}`, () => {
            let manifest: any;

            it('should have valid YAML frontmatter', () => {
                const agentPath = path.join(AGENTS_DIR, agent, 'agent.md');
                const content = fs.readFileSync(agentPath, 'utf-8');
                const parts = content.split('---');
                expect(parts.length).toBeGreaterThanOrEqual(3);
                
                expect(() => {
                    manifest = yaml.load(parts[1]);
                }).not.toThrow();
                
                expect(manifest).toBeDefined();
                expect(manifest.name).toBe(agent);
            });

            it('should have the required tools for its role', () => {
                const role = ROLES[agent];
                expect(role).toBeDefined();

                const requiredTools = getRequiredTools(role);
                const actualTools = manifest?.tools || [];

                const missingTools = requiredTools.filter(t => !actualTools.includes(t));
                const extraTools = actualTools.filter((t: string) => !requiredTools.includes(t));

                expect(missingTools, `Missing tools for ${agent}`).toEqual([]);
                expect(extraTools, `Extra tools for ${agent}`).toEqual([]);
            });
        });
    }
});
