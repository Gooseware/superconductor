const fs = require('fs');

const sessionPath = process.argv[2];

if (!sessionPath || !fs.existsSync(sessionPath)) {
    console.error('Usage: node suggest_tracks.js <path_to_session.json>');
    process.exit(1);
}

const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
const errorMap = new Map();

// Known issues to track mappings
const issueMappings = [
    {
        pattern: /Tool not found|is not a valid tool/,
        description: 'Fix tool hallucinations',
        id: 'fix-hallucinations'
    },
    {
        pattern: /0 occurrences found|Failed to edit/,
        description: 'Improve replace tool reliability',
        id: 'improve-replace'
    },
    {
        pattern: /Policy denial|Tool execution denied/,
        description: 'Resolve Plan Mode policy restrictions',
        id: 'resolve-policies'
    }
];

function analyze() {
    if (!session.messages) return;

    session.messages.forEach(msg => {
        if (msg.type === 'gemini' && msg.toolCalls) {
            msg.toolCalls.forEach(call => {
                const output = JSON.stringify(call.result || {});
                
                issueMappings.forEach(mapping => {
                    if (mapping.pattern.test(output) || (call.status === 'error' && mapping.pattern.test(JSON.stringify(call.result)))) {
                        const stats = errorMap.get(mapping.id) || { count: 0, description: mapping.description };
                        stats.count++;
                        errorMap.set(mapping.id, stats);
                    }
                });
            });
        }
    });

    const suggestions = Array.from(errorMap.values())
        .sort((a, b) => b.count - a.count);

    if (suggestions.length === 0) {
        console.log('No issues detected. No tracks suggested.');
    } else {
        console.log('Suggested Tracks based on session errors:');
        suggestions.forEach(s => {
            console.log(`- ${s.description} (Frequency: ${s.count})`);
        });
    }
}

analyze();
