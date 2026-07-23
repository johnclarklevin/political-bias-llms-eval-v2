# Claude Opus 4.8 political-response replication

This repository reproduces the Washington Post's political-response experiment for **Claude Opus 4.8** and tests how the result changes when the 30-word cap, the remaining style instructions, and questions without meaningful two-party support are removed. All responses are classified by **Claude Fable 5**.

![Horizontal 100% stacked-bar chart titled "Claude Opus 4.8 political-response classifications." Five rows compare the share of responses labeled Left-only (blue), Both (purple), and Right-only (red). Washington Post Experiment: 43.3% left-only, 56.7% both, 0% right-only over 30 reporter-coded responses. Replication of WaPo: 38.0%, 61.3%, 0.7% over 150 responses. No Word Limit: 16.7%, 83.3%, 0% over 150. No System Prompt: 9.3%, 90.7%, 0% over 150. Below a dashed divider noting that it is derived from the No System Prompt responses, No Fringe Questions: 0% left-only, 100% both, 0% right-only over 95 responses across 19 topics.](assets/topline-results.png)

## Topline results

| Condition | Topics | Responses | Left-only | Both | Right-only |
|---|---:|---:|---:|---:|---:|
| Washington Post Experiment | 30 | 30 | 43.3% | 56.7% | 0.0% |
| Replication of WaPo | 30 | 150 | 38.0% | 61.3% | 0.7% |
| No Word Limit | 30 | 150 | 16.7% | 83.3% | 0.0% |
| No System Prompt | 30 | 150 | 9.3% | 90.7% | 0.0% |
| No Fringe Questions | 19 | 95 | 0.0% | 100.0% | 0.0% |

The Washington Post row is recomputed from the Post's frozen source data: one reporter-coded response per topic. Each local condition contains five Claude Opus 4.8 responses per topic, scored by Claude Fable 5. No Fringe Questions reuses the 95 No System Prompt responses whose topics meet the 30% two-party-support rule (assessment v1.1, which added two topics on documented proxy polling grounds after the initial computation — see the revision disclosure in the docs); it is a derived analysis subset, not an independent run. The five rows therefore differ in scorer and samples per topic, and comparisons across them are descriptive.

## What the labels mean

- **Left-only:** the judge detected arguments corresponding only to the supplied liberal endpoint.
- **Both:** the judge detected at least one argument corresponding to each endpoint.
- **Right-only:** the judge detected arguments corresponding only to the supplied conservative endpoint.

These labels measure endpoint coverage. They do not directly measure equal emphasis, neutrality, endorsement, recommendation, factual accuracy, or an underlying model ideology.

## Repository guide

- [Results and sensitivity analysis](docs/results.md)
- [Methodology and limitations](docs/methodology.md)
- [No Fringe Questions assessment](docs/no-fringe-questions.md) (per-question evidence with sources)
- [Right-only label audit](docs/right-only-label-audit.md)
- [Manual label-verification sample](docs/label-verification-sample.md)
- [Data guide](data/README.md) — response-level CSVs, raw JSONL, judge validation, sensitivity tables
- Code: [`code/replicate.mjs`](code/replicate.mjs) (resumable generation + judging harness), [`code/validate-judge.mjs`](code/validate-judge.mjs), [`code/analyze.mjs`](code/analyze.mjs), [`code/sensitivity.mjs`](code/sensitivity.mjs), [`code/verify.mjs`](code/verify.mjs), [`code/chart.py`](code/chart.py)
- Frozen upstream snapshot: [`vendor/washington-post-source/`](vendor/washington-post-source/)

## Models and API configuration

- **Response model:** Claude Opus 4.8 — Claude API model ID `claude-opus-4-8`; `max_tokens: 8192`; no `thinking` field (runs without adaptive thinking); no `temperature`/`top_p`/`top_k`; no tools, caching, multi-turn history, or prefills.
- **Scoring model:** Claude Fable 5 — Claude API model ID `claude-fable-5`; `max_tokens: 4096`; `output_config: {"effort": "medium"}`; adaptive thinking is always on for this model and cannot be disabled.
- **API:** native Claude Messages API, `POST https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. One independent single-turn request per sample. The Claude API provides no experiment sampling seed for these models; the fixed seed `20260722` orders the task list only.

The three physical conditions differ only in the top-level `system` field: the exact original 30-word system prompt, that prompt minus its first sentence, or no `system` field at all. Exact strings are in [`data/raw/manifest.json`](data/raw/manifest.json) and [`docs/methodology.md`](docs/methodology.md).

## Reproduction

Requires Node.js ≥ 22 and Python 3 with `matplotlib` (for the chart only). Set `ANTHROPIC_API_KEY` in your environment, or place it in a git-ignored `.env` file in the repository root.

```bash
npm run validate-judge                  # 180-row judge validation (Fable 5)
npm run replicate -- --output data/raw  # 450 generations + 450 judgments (resumable)
npm run analyze                         # joins, summaries, WaPo comparator, audit sample
npm run sensitivity -- --output data/sensitivity --validation data/judge-validation/summary.json
python3 code/chart.py                   # assets/topline-results.{png,svg}
npm run verify                          # integrity checks (exit 1 on failure)
```

A fresh run reproduces the pipeline but not these exact responses: API outputs are stochastic.

## Sources

- Washington Post repository: <https://github.com/washingtonpost/political-bias-llm-eval>, frozen commit `a8cf5914fb0a71836ef8ab838537863ee85234b9` (vendored under `vendor/washington-post-source/`)
- Article: [Are ChatGPT and other AI chatbots politically biased? We tested them.](https://www.washingtonpost.com/technology/interactive/2026/06/24/are-ai-chatbots-like-chatgpt-politically-biased-we-tested-them/) (June 24, 2026)
- Question set origin: [ModelSlant](https://modelslant.com/)
- Companion package: the GPT-5.5 replication, whose structure, schemas, and methods this repository mirrors

## License

Original code is MIT-licensed ([LICENSE-CODE](LICENSE-CODE)). Research content, data, documentation, charts, and configurations are CC BY-NC-SA 4.0 ([LICENSE-CONTENT](LICENSE-CONTENT)) to the extent the project owner has licensable rights; the vendored Washington Post snapshot retains its own CC BY-NC-SA 4.0 license. See [LICENSE.md](LICENSE.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Copyright © 2026 John Clark Levin. This project is not endorsed by The Washington Post, ModelSlant, Anthropic, OpenAI, or any cited polling organization.
