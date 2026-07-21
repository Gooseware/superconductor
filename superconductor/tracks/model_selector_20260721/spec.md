# Specification: Model Selector Automation for Superconductor

## 1. Overview
This track introduces a smart model selector feature natively integrated into the current Superconductor plugin. The selector fetches the list of available models using the `agy models` CLI command via an autonomous agent swarm. It caches the results securely in the user's home directory (`~/.gemini/available_models.json`). Instead of using a background cron job, the plugin lazily evaluates the cache: if the file is missing or older than 24 hours when the selector is invoked, it automatically triggers a fresh fetch. It provides an interactive TUI prompt (using enquirer/prompts) for selecting models when the Superconductor engine requires a model choice.

## 2. Research Notes
- **Dynamic Selection & Decomposition:** Modern swarm best practices dictate organizing tasks as trees where orchestrator agents fetch and route, while workers perform tasks.
- **Layered Caching:** Caching is crucial to avoid redundant tool and API invocations. The cache prevents stale data and API rate limiting.
- **Unified State:** Maintaining a central "source of truth" (like a local JSON cache) prevents agents from executing redundant fetch logic.

## 3. Architecture Committee Recommendations
- **Lazy Fetch Mechanism:** Instead of a cron job, the selector checks the `mtime` (modification time) of `~/.gemini/available_models.json`. If it's > 24 hours old, it triggers the fetcher.
- **Agentic Fetcher with Resilience:** The fetcher runs as an isolated subagent within the Superconductor plugin, handling retries autonomously and logging failures.
- **Secure Storage:** The cache file (`~/.gemini/available_models.json`) must have `0600` permissions (owner read/write only).
- **Performant Selector:** The UI component should load models from the cache into memory to provide an instant prompt.

## 4. Functional Requirements
- **FR1:** The plugin must spawn a Fetcher Agent to run `agy models` and retrieve available models.
- **FR2:** The Fetcher Agent must save the retrieved models to `~/.gemini/available_models.json`.
- **FR3:** The model selector must evaluate the age of the cache file upon invocation. If missing or older than 24 hours, it must block the UI, dispatch the Fetcher Agent to update the cache, and wait for completion.
- **FR4:** The model selector component must present an interactive TUI prompt (integrated with the existing plugin flow) to the user to pick a model from the cached list.

## 5. Non-Functional Requirements
- **Security:** The `available_models.json` file must be created with `0600` permissions.
- **Performance:** The lazy evaluation ensures the fetch only occurs when needed, minimizing background resource usage.
- **Integration:** The solution must seamlessly integrate into the existing TypeScript/Node.js architecture of the Superconductor extension.
- **Resilience:** The Fetcher Agent must handle CLI failures or timeouts gracefully and report back.

## 6. Acceptance Criteria
- [ ] The plugin correctly checks the `mtime` of the cache file.
- [ ] If the cache is >24h old or missing, the plugin correctly blocks, fetches, and then prompts the user.
- [ ] The Fetcher Agent executes `agy models` and writes to `~/.gemini/available_models.json` with `0600` permissions.
- [ ] The TUI prompt accurately displays the models from the cache.

## 7. Out of Scope
- Direct API integrations (e.g., calling Vertex or Gemini endpoints manually); `agy models` will be the sole source.
- Management or deletion of models.
- Standalone background cron jobs or daemon processes.
