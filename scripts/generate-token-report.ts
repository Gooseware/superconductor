import * as fs from 'fs';
import * as path from 'path';

export interface TokenEntry {
  stage: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  timestamp: string;
}

export function recordTokenUsage(reportPath: string, entry: Omit<TokenEntry, 'timestamp'>): void {
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let entries: TokenEntry[] = [];
  if (fs.existsSync(reportPath)) {
    try {
      const raw = fs.readFileSync(reportPath, 'utf-8');
      entries = JSON.parse(raw);
    } catch {
      entries = [];
    }
  }

  entries.push({
    stage: entry.stage || 'Unknown Stage',
    model: entry.model || 'unknown',
    input_tokens: Math.max(0, entry.input_tokens || 0),
    output_tokens: Math.max(0, entry.output_tokens || 0),
    cost_usd: Math.max(0, entry.cost_usd || 0),
    timestamp: new Date().toISOString()
  });

  fs.writeFileSync(reportPath, JSON.stringify(entries, null, 2), 'utf-8');
}

export function generateTokenReport(reportPath: string): string {
  if (!fs.existsSync(reportPath)) {
    return `## Token Efficiency Report\n\n*No token logs recorded for this run.*`;
  }

  try {
    const raw = fs.readFileSync(reportPath, 'utf-8');
    const entries: TokenEntry[] = JSON.parse(raw);

    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;

    let report = `## Token Efficiency Report\n\n`;
    report += `| Stage | Model | Input Tokens | Output Tokens | Cost (USD) |\n`;
    report += `|---|---|---|---|---|\n`;

    for (const e of entries) {
      const input = Math.max(0, e.input_tokens || 0);
      const output = Math.max(0, e.output_tokens || 0);
      const cost = Math.max(0, e.cost_usd || 0);

      totalCost += cost;
      totalInput += input;
      totalOutput += output;
      report += `| ${e.stage} | ${e.model} | ${input} | ${output} | $${cost.toFixed(4)} |\n`;
    }

    report += `| **TOTAL** | -- | **${totalInput}** | **${totalOutput}** | **$${totalCost.toFixed(4)}** |\n\n`;

    // Baseline calculation (assumes 1 monolithic arbiter pass = 22k tokens @ $5.40/1M)
    const baselineCost = 0.1188;
    const savingsPercent = totalCost < baselineCost ? Math.max(0, (1 - totalCost / baselineCost) * 100).toFixed(1) : '0.0';

    report += `**Baseline Monolithic Estimate:** $${baselineCost.toFixed(4)}\n`;
    report += `**Actual Savings:** ${savingsPercent}%\n`;

    return report;
  } catch (err) {
    return `## Token Efficiency Report\n\n*Failed to parse token logs.*`;
  }
}
