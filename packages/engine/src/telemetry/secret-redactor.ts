/** Default redaction patterns. Matches common credential formats. */
export const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{35}/g,               // Google API keys
  /(?:GEMINI|GOOGLE)_API_KEY=[^\s&"']*/gi,  // Env var assignments (stop at JSON quotes)
  /GCP_[A-Z_]+=[^\s"']*/g,                  // GCP env vars (stop at JSON quotes)
  /(?:sk|pk)-[A-Za-z0-9]{20,}/g,            // OpenAI-style keys
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,       // Bearer tokens
  /-----BEGIN [A-Z ]+KEY-----[\s\S]*?-----END [A-Z ]+KEY-----/g, // PEM keys
  /(?:password|secret|token|api_key)\s*[:=]\s*[^\s"',}{]{8,}/gi, // key=value pairs (no surrounding quotes captured)
];

export function redactSecrets(text: string, patterns: RegExp[] = DEFAULT_SECRET_PATTERNS): string {
  let result = text;
  for (const pattern of patterns) {
    try {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;
      result = result.replace(pattern, '[REDACTED]');
    } catch (e) {
      console.warn(`[SecretRedactor] Pattern failed, skipping: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
