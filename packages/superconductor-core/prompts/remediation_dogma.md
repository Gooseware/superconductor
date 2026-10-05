# Superconductor Swarm Orchestration: Invariant-First Remediation Dogma

## The Problem Statement
The Swarm ecosystem has suffered from a chronic "whack-a-mole" remediation pathology. When tests fail or bugs are found, agents often default to applying shallow, local call-site patches (e.g., adding `?? 0`, `|| []`, or empty `catch {}` blocks). While these local patches silence immediate errors, they mask underlying state corruption, ignore initialization failures at inception, and introduce unpredictable systemic degradation over time. 

Remediation must cure the disease, not just suppress the symptoms. The mandates below strictly govern how remediators must operate within the Superconductor framework.

## 5 Core Mandates

### 1. Root-Cause & Inception Mandate (No Defensive Nulling)
Strict prohibition of call-site fallbacks masking missing state. Remediation must trace errors backwards to the state origin or initializer. If state is missing or malformed at the call site, the bug is at the point of creation.

*   **Bad (Call-site Patching):**
    ```typescript
    const score = player.stats?.score ?? 0; // Hides the fact that stats failed to initialize
    ```
*   **Good (Inception Fix):**
    ```typescript
    // Fix at the factory/initializer level
    function createPlayer(id: string): Player {
      return { id, stats: { score: 0, level: 1 } }; 
    }
    const score = player.stats.score; // Safe, invariant guaranteed
    ```

### 2. Single Source of Truth / Dual-Write Invariant
If data must exist in two places, changes require an atomic dual-write transaction or must rely on a single store with on-demand computation. Logging a divergence warning while continuing execution is a fatal defect.

*   **Bad (Divergent State):**
    ```typescript
    cache.set(key, value);
    try {
      await db.insert(value);
    } catch (e) {
      log.error("Cache and DB diverged"); // Fatal defect: continuing execution with corrupted state
    }
    ```
*   **Good (Atomic/Computed State):**
    ```typescript
    await db.transaction(async (tx) => {
      await tx.insert(value);
      cache.set(key, value); // Only updates if DB succeeds
    });
    ```

### 3. Execution Environment Fidelity
Mandatory execution against real production SQLite schema migrations (including `CHECK` constraints, foreign keys, and indexes).
For Cloudflare Workers/Durable Objects, you must always receive and invoke `ctx.waitUntil`. Passing a bare `env` and dropping promises across isolate boundaries is strictly forbidden.

*   **Bad (Dropped Promises):**
    ```typescript
    export default {
      async fetch(req, env) {
        logAnalytics(req); // Promise dropped, execution context may die
        return new Response("OK");
      }
    }
    ```
*   **Good (Fidelity & WaitUntil):**
    ```typescript
    export default {
      async fetch(req, env, ctx) {
        ctx.waitUntil(logAnalytics(req));
        return new Response("OK");
      }
    }
    ```

### 4. Strict Monotonicity & Sequence Rules
Polling, synchronization, and CRDT handlers must enforce strict monotonicity (`headSeq > current.lastSeq`). Stale async network responses must never overwrite newer real-time state.

*   **Bad (Race Condition):**
    ```typescript
    async function syncData(serverState) {
      localState = serverState; // Stale network response could overwrite newer local changes
    }
    ```
*   **Good (Strict Monotonicity):**
    ```typescript
    async function syncData(serverState) {
      if (serverState.seq > localState.seq) {
        localState = serverState;
      }
    }
    ```

### 5. Zero Test-Fixture Weakening
Do not auto-generate test fixtures (e.g., using `writeFileSync` in tests to bypass validation). Replace flaky wall-clock assertions (`toBeLessThan(Xms)`) with deterministic algorithmic operation counters or logical state assertions.

*   **Bad (Wall-clock Assertion):**
    ```typescript
    await runTask();
    expect(Date.now() - start).toBeLessThan(50); // Flaky on CI
    ```
*   **Good (Deterministic Counter):**
    ```typescript
    const ops = await runTask();
    expect(ops.tickCount).toBe(2); // Deterministic
    ```

## Remediator Pre-Submission Invariant Checklist

Before finalizing any remediation, the agent MUST verify the following:
- [ ] Have I traced the failure to its true root inception point, rather than patching the crash at the call site?
- [ ] Are all dual-writes wrapped in atomic transactions (or refactored to compute-on-the-fly)?
- [ ] Is `ctx.waitUntil` correctly utilized for all background tasks in Edge environments?
- [ ] Does state merging strictly validate `seq` or timestamps to guarantee monotonicity?
- [ ] Are tests deterministic (no time-based bounds, no auto-written fixtures to force passes)?
