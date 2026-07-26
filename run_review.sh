#!/bin/bash
PLAN=$(cat superconductor/tracks/orchestrator_self_healing_20260726/plan.md)
SPEC=$(cat superconductor/tracks/orchestrator_self_healing_20260726/spec.md)
PROMPT="Review the following implementation plan against the specification.
Look for missing steps, logical errors, or improvements.
Respond with the updated plan in diff format if there are changes, or 'No changes needed' if it is perfect.

=== SPEC ===
$SPEC

=== PLAN ===
$PLAN"
agy --model claude-sonnet-4-6 --print "$PROMPT"
