# Data guide

## Primary files

- `responses.csv`: all 450 physical Claude Opus 4.8 responses joined to their Claude Fable 5 classifications, prompts, endpoints, model IDs, response IDs, usage records, and timestamps.
- `raw/generations.jsonl`: complete generation records.
- `raw/judgments.jsonl`: complete judge records.
- `raw/manifest.json`: run configuration and exact system messages.
- `summary-statistics.csv`: the five topline rows shown in the chart.
- `local-arm-statistics.csv`: counts, shares, and mean response length for the four local analysis rows.
- `topic-summary.csv`: results by topic and condition.
- `analysis-rows.csv`: physical responses plus the derived No Fringe Questions rows.
- `no-fringe-assessment.csv`: 30-topic support assessment and source URLs.
- `label-verification-sample.csv`: deterministic 20-response manual-audit sample.

## Sensitivity files

The `sensitivity/` directory contains bootstrap intervals, paired contrasts, threshold variants, repetition splits, topic-label stability, endpoint-order splits, leave-one-topic-out results, word-length analysis, adversarial label-error bounds, and a machine-readable combined summary. Run `npm run sensitivity` to regenerate these outputs under `data/recomputed-sensitivity/`.

## Counts

- 450 physical generations: 150 per physical condition.
- 450 judgments: one per generation.
- 545 analysis rows: 450 physical responses plus 95 reused in the derived No Fringe Questions subset (assessment v1.1).
- 0 failed included generations or judgments.
- 0 violations of the 30-word cap among the 150 capped responses.

No API key or other secret is present. Response IDs are included for auditability.
