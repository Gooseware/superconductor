# Token Efficiency Report

## Stage Breakdown
| Stage | Model | Input Tokens | Output Tokens | Cost (USD) |
|---|---|---|---|---|
| Deterministic Preflight | -- | -- | -- | $0.0000 |
| Flash Review Panel | Flash | 0 | 0 | $0.0000 |
| Residual Pass (Optional) | Flash | 0 | 0 | $0.0000 |
| Arbiter Pass (Optional) | Pro / Sonnet | 0 | 0 | $0.0000 |
| **TOTAL** | -- | **0** | **0** | **$0.0000** |

## Findings per Stage
- **Flash Reviewers:** 0 raw findings
- **Deduplicated:** 0 unique findings
- **Security-Critical:** 0 findings

## Actual vs. Baseline Cost
- **Baseline Monolithic Estimate (Single Arbiter Pass):** $0.1188
- **Actual Review Panel Cost:** $0.0000
- **Cost Savings:** 100.0%

## Calibration Notes
- Quorum Gate Status: `CanSkipArbiter` flag set.
- Threshold Recommendation: Agreement K/N ratio observed is optimal for deferral.
