export const ANTI_PATTERNS: Record<string, Record<string, string[]>> = {
    typescript: {
        adversarial: [
            "Phantom Implementation: returning empty strings or null instead of actual implementation",
            "Coverage Map Gaming: writing tests that just execute code without asserting logic",
            "Test Theatre: testing mocked internal functions without integrating them"
        ]
    },
    python: {
        adversarial: [
            "Phantom Implementation: using pass or NotImplementedError instead of actual logic",
            "Coverage Map Gaming: broad except clauses that mask failures during tests"
        ]
    }
};
