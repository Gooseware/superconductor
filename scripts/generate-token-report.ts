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
      totalCost += e.cost_usd;
      totalInput += e.input_tokens;
      totalOutput += e.output_tokens;
      report += `| ${e.stage} | ${e.model} | ${e.input_tokens} | ${e.output_tokens} | $${e.cost_usd.toFixed(4)} |\n`;
    }

    report += `| **TOTAL** | -- | **${totalInput}** | **${totalOutput}** | **$${totalCost.toFixed(4)}** |\n\n`;

    // Baseline calculation (assumes 1 monolithic arbiter pass = 22k tokens @ $5.40/1M)
    const baselineCost = 0.1188;
    const savingsPercent = totalCost < baselineCost ? ((1 - totalCost / baselineCost) * 100).toFixed(1) : '0';

    report += `**Baseline Monolithic Estimate:** $${baselineCost.toFixed(4)}\n`;
    report += `**Actual Savings:** ${savingsPercent}%\n`;

    return report;
  } catch (err) {
    return `## Token Efficiency Report\n\n*Failed to parse token logs.*`;
  }
}
