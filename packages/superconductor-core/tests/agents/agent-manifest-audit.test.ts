import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AGENTS_DIR = path.join(__dirname, '../../../../agents');

const READ_TOOLS = [
    "send_message", "find_by_name", "grep_search", "view_file", "list_dir",
    "read_url_content", "search_web", "schedule", "generate_image", "manage_task", "notebook_edit"
];
const RUN_TOOLS = ["run_command"];
const WRITE_TOOLS = ["multi_replace_file_content", "replace_file_content", "write_to_file"];

const ROLES = {
    "adversarial-reviewer": [...READ_TOOLS],
    "correctness-reviewer": [...READ_TOOLS],
    "regression-reviewer": [...READ_TOOLS, ...RUN_TOOLS],
    "security-reviewer": [...READ_TOOLS],
    "superconductor-reviewer": [...READ_TOOLS],
    "superconductor-oracle": [...READ_TOOLS, ...RUN_TOOLS, "ask_question"],
    "superconductor-processor": [...READ_TOOLS, ...RUN_TOOLS, ...WRITE_TOOLS],
    "superconductor-dreamer": [...READ_TOOLS, ...RUN_TOOLS, ...WRITE_TOOLS],
    "remediation-processor": [...READ_TOOLS, ...RUN_TOOLS, ...WRITE_TOOLS]
} as Record<string, string[]>;

describe('Agent Manifests Audit', () => {
    if (!fs.existsSync(AGENTS_DIR)) {
        throw new Error(`Agents directory not found at ${AGENTS_DIR}.`);
    }

    const agents = fs.readdirSync(AGENTS_DIR).filter(d => {
        const stat = fs.statSync(path.join(AGENTS_DIR, d));
        return stat.isDirectory() && fs.existsSync(path.join(AGENTS_DIR, d, 'agent.md'));
    });

    for (const agent of agents) {
        describe(`Agent: ${agent}`, () => {
            it('should have valid YAML frontmatter and required tools', () => {
                const agentPath = path.join(AGENTS_DIR, agent, 'agent.md');
                const content = fs.readFileSync(agentPath, 'utf-8');
                const parts = content.split('---');
                expect(parts.length).toBeGreaterThanOrEqual(3);
                
                let manifest: any;
                expect(() => {
                    manifest = yaml.load(parts[1]);
                }).not.toThrow();
                
                expect(manifest).toBeDefined();
                expect(typeof manifest).toBe('object');
                expect(manifest).not.toBeNull();
                expect(manifest.name).toBe(agent);
                
                const requiredTools = ROLES[agent];
                if (!requiredTools) {
                    expect.fail(`No role defined for ${agent}`);
                }
                expect(Array.isArray(manifest?.tools)).toBe(true);

                const actualTools = manifest?.tools || [];

                const missingTools = requiredTools.filter(t => !actualTools.includes(t));
                const extraTools = actualTools.filter((t: string) => !requiredTools.includes(t));

                expect(missingTools, `Missing tools for ${agent}`).toEqual([]);
                expect(extraTools, `Extra tools for ${agent}`).toEqual([]);
            });
        });
    }
});
