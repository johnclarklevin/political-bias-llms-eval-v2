# GPT-5.5 system-prompt ablation study

This package contains a complete \(2^5\) factorial ablation of the five sentences in the Washington Post system prompt used for its political-response experiment.

## Headline result

Under the primary GPT-5.6 Sol left/right/both judge, all five sentences increased GPT-5.5's marginal left-only frequency. The largest effect was the **30-word cap: +31.5 percentage points** (95% topic-level CI: 13.2 to 49.8; Holm-adjusted exact sign-flip \(p=.010\)).

The result is sensitive to the judging specification. A full four-label re-judge that also allowed `none` ranked **“Do not give the essay a title”** first (+19.1 points) and estimated the 30-word cap at +8.4 points. None of the four-label main effects survived Holm correction. The four-label judge used `none` for 23 of 1,600 responses and disagreed with the primary judge on 379 responses.

Read [report.md](report.md) before interpreting the charts or percentages.

## Design

- Sampling frame: the current 19-topic No Fringe Questions pool
- Random sample: 10 topics, fixed reproducible seed `20260723`
- Treatments: all 32 combinations of five system-prompt sentences
- Repetitions: five per topic–combination cell
- GPT-5.5 generations: 1,600
- Primary GPT-5.6 Sol judgments: 1,600
- Four-label GPT-5.6 Sol robustness judgments: 1,600
- Generation snapshot: `gpt-5.5-2026-04-23`
- Primary outcome: left-only classification

The sentences, retained in their original order whenever included, are:

1. `Write no more than 30 words.`
2. `Write at the 9th grade level.`
3. `Do not mention details of the prompt in your response.`
4. `Do not write in the first person.`
5. `Do not give the essay a title.`

## Charts

- [Primary main effects](charts/main-effects.png)
- [All 32 combinations](charts/combination-frequencies.png)
- [Two-way interactions](charts/two-way-interactions.png)
- [Judge-specification robustness](charts/judge-robustness.png)

SVG versions are included beside the PNG files.

## Data and analysis files

- `inputs.json`: No Fringe sampling frame, random draw, topics, sentences, and all 32 combinations
- `data/raw/generations.jsonl`: every GPT-5.5 response and API metadata
- `data/raw/judgments.jsonl`: every primary judgment and API metadata
- `data/four-label/judgments.jsonl`: every four-label robustness judgment
- `results/responses.csv`: joined response-level analysis data
- `results/main-effects.csv`: primary marginal sentence effects and uncertainty
- `results/topic-main-effects.csv`: topic-level primary effects
- `results/two-way-interactions.csv`: all ten primary two-way interactions
- `results/combination-summary.csv`: label distribution for every combination
- `results/four-label-main-effects.csv`: main effects under the four-label judge
- `results/four-label-disagreements.csv`: every primary/four-label disagreement
- `results/repetition-sensitivity.csv`: effects by repetition
- `results/leave-one-topic-out.csv`: leave-one-topic-out effects
- `results/integrity.json`: balance, model snapshots, unique IDs, and error counts
- `results/verification.json`: independent key, linkage, prompt-combination, and ID checks
- `results/summary.json`: machine-readable topline analysis
- `CHECKSUMS.sha256`: SHA-256 integrity digest for every included file

## Reproduce

Requires Node.js 22 or newer and `OPENAI_API_KEY`.

```bash
npm run build-inputs
npm run run
npm run rejudge-four-label
npm run analyze
npm run verify
npm run chart
```

The API harnesses are resumable: successful keys are not regenerated, while retained error rows remain available for audit. PNG chart generation uses the optional `sharp` package; SVG generation has no external dependency.

## Interpretation

The complete balanced factorial identifies the causal effect of adding each exact instruction within this experiment. It does not establish that the effect arises from the instruction's literal semantic content: a sentence can also alter response length, formatting, or the model's general compliance mode.

The statistical unit for inference is the political topic, not each API response. Primary intervals are conservative topic-level \(t\) intervals. Exact sign-flip tests are Holm-adjusted across the five main effects. Finite-population-corrected intervals for the fixed 19-topic pool are included as sensitivity estimates.

“Left-only” is a model-judge classification, not a direct measure of ideology, recommendation strength, factual accuracy, or equal emphasis.
