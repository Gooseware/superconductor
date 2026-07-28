# Specification: Standalone Gemini Deep Research Provider

## 1. Overview
Implement two new, standalone `IResearchProvider` implementations — one targeting the **Google AI Studio Interactions API** (API key auth) and one targeting **Vertex AI** (ADC/service account auth). Both run concurrently and asynchronously via the `ResearchExecutor`'s existing parallel query dispatch.

## 2. Architecture Committee Recommendations
- **Provider Interface:** Implement both `GeminiApiDeepResearchProvider` and `VertexAiDeepResearchProvider`, each conforming to `IResearchProvider`.
- **Shared Internals:** Extract a `GeminiInteractionsClient` utility and `AsyncLongPoller` utility shared by both providers.
- **`IResearchSource` Extension:** The current `{ url; title? }` contract is too thin for a 64k-token research report. Add an optional `content?: string` field. The `brief-synthesizer.ts` `llmMapSource()` will use `content` when present, falling back to `title` for backward compatibility.
- **API Key Handling:** `GeminiApiDeepResearchProvider` validates `process.env.GEMINI_API_KEY`. `VertexAiDeepResearchProvider` uses ADC via `process.env.GCP_PROJECT_ID` and `process.env.GCP_LOCATION`.
- **Telemetry Security:** Explicitly scrub `GEMINI_API_KEY` from `TelemetryStore` and all standard logging.
- **Pre-existing Bug Fix:** `ResearchBriefSynthesizer.synthesize()` signature mismatch (missing `queries` parameter) must be fixed as part of this track.

## 3. Research Notes (2026-07-28)

### Quota Summary
| Dimension | Google AI Studio | Vertex AI |
|---|---|---|
| RPM | 2–5 RPM | 5–60 RPM (DSQ) |
| RPD | Project billing tier | No hard cap (billing limited) |
| Output per interaction | 64k tokens | 64k tokens |
| Max input context | 1M tokens | 1M tokens |

### Latency Profile
| Model | Average | Maximum |
|---|---|---|
| `deep-research-preview-04-2026` | 5–10 min | 15 min |
| `deep-research-max-preview-04-2026` | 10–20 min | 60 min |

### ULTRA User Clarification
Consumer Ultra ($99.99/mo) grants a 5–20× compute multiplier for **consumer-facing Gemini apps**. Developer API key rate limits are **separate** and determined by Cloud Billing tier (Pay-As-You-Go, Tier 1/2/3). An Ultra subscription does **not** automatically upgrade developer API quotas.

### SDK Shape (same for both providers)
```typescript
// AI Studio
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCP_PROJECT_ID,
  location: process.env.GCP_LOCATION ?? 'us-central1',
});

// Both use the same Interactions API
const interaction = await ai.interactions.create({ agent, input, background: true });
```

## 4. Functional Requirements
- **FR1:** Add `@google/genai` (>= 2.3.0) to dependencies in `packages/engine`.
- **FR2:** Extend `IResearchSource` with `content?: string` in `types.ts`.
- **FR3:** Fix `ResearchBriefSynthesizer.synthesize()` signature to include the `queries: string[]` parameter.
- **FR4:** Implement `GeminiInteractionsClient` utility (shared, handles SDK init for both auth modes).
- **FR5:** Implement `AsyncLongPoller` utility with:
  - Configurable `pollIntervalMs` and `maxWaitMs` (20 min default, 45 min for `-max` model)
  - `Retry-After` header parsing on 429 responses
  - Exponential backoff with jitter
- **FR6:** Implement `GeminiApiDeepResearchProvider` (AI Studio, `GEMINI_API_KEY`).
- **FR7:** Implement `VertexAiDeepResearchProvider` (Vertex AI, ADC via `GCP_PROJECT_ID` + `GCP_LOCATION`).
- **FR8:** Update `ResearchProviderRegistry.resolve()` to accept `options?: { apiKey?: string }` and register both new keys: `gemini-api-deep-research` and `vertex-ai-deep-research`.
- **FR9:** Wire the provider key from `agent-config.md` through to `ResearchProviderRegistry.resolve()` at call sites.

## 5. Non-Functional Requirements
- **Security:** `GEMINI_API_KEY` and `GCP_*` vars must never appear in logs or `TelemetryStore` payloads.
- **Reliability:** Polling must not block the Node.js event loop. Use async/await with `setTimeout`-based delays only.
- **Concurrency:** Both providers are designed to be invoked concurrently via `Promise.all`. No shared mutable state.

## 6. Acceptance Criteria
- [ ] `GeminiApiDeepResearchProvider` implements `IResearchProvider`, throws `ResearchProviderUnavailableError` if `GEMINI_API_KEY` is missing.
- [ ] `VertexAiDeepResearchProvider` implements `IResearchProvider`, throws `ResearchProviderUnavailableError` if `GCP_PROJECT_ID` is missing.
- [ ] `ResearchProviderRegistry.resolve('gemini-api-deep-research')` returns `GeminiApiDeepResearchProvider`.
- [ ] `ResearchProviderRegistry.resolve('vertex-ai-deep-research')` returns `VertexAiDeepResearchProvider`.
- [ ] Specifying either key in `agent-config.md` routes research correctly end-to-end.
- [ ] `IResearchSource.content` field accepted and passed through `brief-synthesizer.ts`.
- [ ] `AsyncLongPoller` correctly suspends on 429 `Retry-After` and resumes.
- [ ] `GEMINI_API_KEY` scrubbed from all `TelemetryStore` outputs.
- [ ] All new code covered by unit tests (>80% coverage), including: missing key, timeout, 429 retry, success path, and Vertex AI ADC path.

## 7. Out of Scope
- `collaborative_planning` mode (interactive plan review before research execution)
- Streaming partial deep research results
- Vertex AI private data grounding (BigQuery, AlloyDB, Cloud Storage)
- Automatic developer API quota upgrades from consumer Ultra subscription
- Consumer-facing Gemini app integration
