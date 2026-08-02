import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleDeepResearchProvider } from "../../../src/research/providers/google-deep-research-provider.js";
import { ResearchProviderUnavailableError } from "../../../src/research/errors/research-provider-unavailable-error.js";

describe("GoogleDeepResearchProvider", () => {
  let provider: GoogleDeepResearchProvider;
  let mockExecuteTool: any;

  beforeEach(() => {
    mockExecuteTool = vi.fn().mockImplementation(async (toolName, args) => {
      if (args.query === "FAIL_NOW") {
        throw new Error("Simulated network error");
      }
      return [
        {
          type: "github",
          url: "https://github.com/mock/repo",
          title: "Mock Repo",
          stars: 150,
          lastCommitDaysAgo: 10,
          license: "MIT"
        }
      ];
    });
    provider = new GoogleDeepResearchProvider(mockExecuteTool);
  });

  it("sanitizes and wraps the raw markdown in XML tags", async () => {
    const results = await provider.search({ term: "test query" });
    
    expect(results.length).toBe(1);
    
    expect(results[0].url).toBe("<untrusted_research_results>https://github.com/mock/repo</untrusted_research_results>");
    expect(results[0].title).toMatch(/<untrusted_research_results>.*Mock Repo.*<\/untrusted_research_results>/s);
  });

  it("implements exponential backoff on failures", async () => {
    mockExecuteTool.mockRejectedValueOnce(new Error("Temp failure"))
                 .mockResolvedValueOnce([
                   {
                     type: "github",
                     url: "https://github.com/ok",
                     title: "OK Repo",
                     stars: 200,
                     lastCommitDaysAgo: 5,
                     license: "MIT"
                   }
                 ]);
                 
    const startTime = Date.now();
    const results = await provider.search({ term: "test retry" });
    const elapsed = Date.now() - startTime;
    
    expect(results.length).toBe(1);
    expect(mockExecuteTool).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it("throws ResearchProviderUnavailableError on 3 consecutive failures (circuit breaker)", async () => {
    mockExecuteTool.mockRejectedValue(new Error("Persistent failure"));

    await expect(provider.search({ term: "FAIL_NOW" })).rejects.toThrow("Persistent failure");
    await expect(provider.search({ term: "FAIL_NOW" })).rejects.toThrow("Persistent failure");
    await expect(provider.search({ term: "FAIL_NOW" })).rejects.toThrow("Persistent failure");

    // 4th call should fail immediately with circuit breaker error
    await expect(provider.search({ term: "test" })).rejects.toThrow(ResearchProviderUnavailableError);
    await expect(provider.search({ term: "test" })).rejects.toThrow("Circuit breaker open");
    
    expect(mockExecuteTool).toHaveBeenCalledTimes(12);
  });
});
