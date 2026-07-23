# GPT-5.5 focused sentence-5 experiment

This package tests whether the word `essay` is responsible for the sentence-5
main effect found in the supplied GPT-5.5 prompt-ablation study.

## Design

- 19 topics: the complete current No Fringe pool
- 16 backgrounds: every inclusion combination of Washington Post prompt
  sentences 1–4
- 5 arms: no sentence 5, essay, output, response, and heading
- 1 independent generation per topic × background × arm cell
- 1,520 GPT-5.5 responses
- a blinded three-label primary judge and four-label robustness judge

The primary pre-specified contrast is the essay arm minus the mean of the three
alternative phrasings. The analysis also estimates all four wording effects
versus the no-sentence control, applies Holm correction within planned test
families, and performs a ±10 percentage-point equivalence test.

See `PREREGISTRATION.md` for the interpretation rules fixed before generation.

## Run

Node.js 22 or newer and `OPENAI_API_KEY` are required. The runner can read the
key from the environment or from an untracked `.env` file at the workspace
root. Use `--env PATH` to select another credentials file.

```bash
npm run build-inputs
npm run run
npm run analyze
npm run verify
npm run chart
npm run checksums
```

The API harness is resumable. Successful topic–background–arm keys are never
regenerated, while failed attempts remain in the JSONL files for audit and are
retried. Phases can also be run separately:

```bash
node code/experiment.mjs run --phase generate
node code/experiment.mjs run --phase primary
node code/experiment.mjs run --phase four
```

## Outputs

- `report.md`: narrative findings and statistical tables
- `charts/`: SVG comparison charts
- `results/responses.csv`: joined response-level analysis data
- `results/arm-summary.csv`: arm label frequencies and descriptive statistics
- `results/primary-contrasts.csv`: pre-specified three-label contrasts
- `results/four-label-contrasts.csv`: robustness contrasts
- `results/topic-arm-summary.csv`: topic-level arm rates
- `results/word-count-contrasts.csv`: length contrasts
- `results/exploratory-word-limit-moderation.csv`: exploratory length-cap moderation
- `results/formatting-summary.csv`: strict heading-marker summaries
- `results/summary.json`: machine-readable findings
- `results/verification.json`: independent balance, prompt, ID, and linkage checks

The source topic snapshot and No Fringe audit are included in `source/`.
