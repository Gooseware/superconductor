const fs = require('fs');
let code = fs.readFileSync('packages/superconductor-core/src/swarm/RemediatorPromptBuilder.ts', 'utf8');

code = code.replace(/const antiPatternsList = ANTI_PATTERNS\[language\]\?\.adversarial \|\| \[\];/, `const antiPatternsList = profile.testTheatreAntiPatterns && profile.testTheatreAntiPatterns.length > 0 ? profile.testTheatreAntiPatterns : (ANTI_PATTERNS[language]?.adversarial || []);`);

code = code.replace(/DEFINITION_OF_DONE: \$\{taskInfo\.definitionOfDone\}/, `DEFINITION_OF_DONE: \${taskInfo.definitionOfDone}\nTEST_COMMAND: \${profile.testCommand}\nMANIFEST_FILES: \${profile.manifestFiles.join(', ')}\nGENERATED_DIRS: \${profile.generatedDirs.join(', ')}`);

fs.writeFileSync('packages/superconductor-core/src/swarm/RemediatorPromptBuilder.ts', code);
