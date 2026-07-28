# Specification: Standalone Gemini Deep Research Provider

## 1. Overview
Implement a new, standalone `IResearchProvider` named `GeminiApiDeepResearchProvider` that leverages the official `@google/genai` Interactions API for deep research, using an explicitly provided `GEMINI_API_KEY` environment variable.

## 2. Architecture Committee Recommendations
- **Provider Interface:** Create `GeminiApiDeepResearchProvider` implementing `IResearchProvider`.
- **API Key Handling:** Validate `process.env.GEMINI_API_KEY`. Throw a descriptive `ResearchProviderUnavailableError` if missing so the system can gracefully abort or fallback.
- **Polling Loop:** Use `client.interactions.create({ ..., background: true })` and implement an asynchronous polling loop inside the `search` method to wait for completion.
- **Timeouts:** Implement an absolute timeout (e.g., 45 minutes) within the polling loop to prevent infinite hanging. Account for the 30+ minute potential runtime of deep research.
- **Rate Limit Resilience:** Polling logic must explicitly parse `Retry-After` headers on 429 Too Many Requests errors and suspend accordingly.
- **Telemetry Security:** Explicitly scrub `GEMINI_API_KEY` from `TelemetryStore` and all standard logging.

## 3. Research Notes
- The recommended approach for Gemini Deep Research in Node.js is via the Interactions API (`@google/genai` package).
- Initiating a background task requires `background: true`.
- The interaction status must be polled using `client.interactions.get(interactionId)` until the status is `"completed"` or `"failed"`.

## 4. Functional Requirements
- **FR1:** Add `@google/genai` to dependencies in `packages/engine`.
- **FR2:** Implement `GeminiApiDeepResearchProvider.ts` in `packages/engine/src/research/providers/`.
- **FR3:** Implement an async polling loop to wait for the interaction to complete, properly parsing `Retry-After` headers.
- **FR4:** Register the new provider in `provider-registry.ts` under the key `gemini-api-deep-research`.
- **FR5:** Map the resulting deep research output into `IResearchSource[]`.

## 5. Non-Functional Requirements
- **Security:** Do not log or leak the `GEMINI_API_KEY` in any logs or telemetry payloads.
- **Reliability:** Support up to 45 minute polling lifecycles for complex queries without breaking event loops.

## 6. Acceptance Criteria
- [ ] `GeminiApiDeepResearchProvider` exists and correctly implements `IResearchProvider`.
- [ ] Specifying `gemini-api-deep-research` in `agent-config.md` successfully routes research to this new provider.
- [ ] The provider successfully retrieves a deep research response using the API key.
- [ ] If `GEMINI_API_KEY` is missing, a clear `ResearchProviderUnavailableError` is thrown.
- [ ] The `GEMINI_API_KEY` is scrubbed from all TelemetryStore logs.
