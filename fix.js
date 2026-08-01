const fs = require('fs');
let file1 = '/home/gooseware/.gemini/antigravity-cli/brain/a56002ad-af9f-4659-a8a2-306bb9bd9cda/.system_generated/worktrees/subagent-Master-Swarm-Orchestrator-self-56be40b4/packages/superconductor-core/src/intelligence/domain-partitioner.ts';
let code1 = fs.readFileSync(file1, 'utf8');
const search1 = `        const graphifyFile = path.join(this.intelligenceDir, '09_graphify_graph.json');
        if (fs.existsSync(graphifyFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(graphifyFile, 'utf8'));
                if (data && data.nodes && Array.isArray(data.nodes)) {
                    for (const node of data.nodes) {
                        if (node.id && node.community !== undefined) {
                            const comm = String(node.community);
                            if (!groups.has(comm)) {
                                groups.set(comm, []);
                            }
                            groups.get(comm)!.push(node.id);
                        }
                    }
                    if (groups.size > 0) {
                        usedGraphify = true;
                    }
                }
            } catch (e) {
                // fallback to directory split
            }
        }`;
const repl1 = `        const graphifyFile = path.join(this.intelligenceDir, '09_graphify_graph.json');
        if (fs.existsSync(graphifyFile)) {
            try {
                const stats = fs.statSync(graphifyFile);
                if (stats.size > 50 * 1024 * 1024) {
                    console.warn(\`[DomainPartitioner] File too large (\${stats.size} bytes). Skipping to prevent memory leak.\`);
                } else {
                    const data = JSON.parse(fs.readFileSync(graphifyFile, 'utf8'));
                    if (data && data.nodes && Array.isArray(data.nodes)) {
                        for (const node of data.nodes) {
                            if (node.id && node.community !== undefined) {
                                const comm = String(node.community);
                                if (!groups.has(comm)) {
                                    groups.set(comm, []);
                                }
                                groups.get(comm)!.push(node.id);
                            }
                        }
                        if (groups.size > 0) {
                            usedGraphify = true;
                        }
                    }
                }
            } catch (e) {
                console.warn(\`[DomainPartitioner] Failed to parse JSON, falling back to directory split: \${e}\`);
                // fallback to directory split
            }
        }`;
fs.writeFileSync(file1, code1.replace(search1, repl1));

let file2 = '/home/gooseware/.gemini/antigravity-cli/brain/a56002ad-af9f-4659-a8a2-306bb9bd9cda/.system_generated/worktrees/subagent-Master-Swarm-Orchestrator-self-56be40b4/packages/superconductor-core/src/intelligence/runners/graphify.ts';
let code2 = fs.readFileSync(file2, 'utf8');
const search2 = `  } catch (err) {
    return { status: 'degraded' };
  }`;
const repl2 = `  } catch (err) {
    console.warn(\`[graphify] execution failed: \${err}\`);
    return { status: 'degraded' };
  }`;
fs.writeFileSync(file2, code2.replace(search2, repl2));
