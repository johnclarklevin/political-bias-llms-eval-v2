# Scoring robustness: the missing `none` category

## Why this matters

The primary GPT-5.6 Sol judge was instructed to return `left`, `right`, or `both`. By contrast, the Washington Post’s highlight-based evaluator implicitly returns `none` when a response contains neither a Democratic nor Republican highlight. The primary local judge therefore cannot distinguish a refusal, irrelevant answer, or purely descriptive answer from the three available categories.

That difference is most consequential in the long-response conditions, especially No System Prompt, where `both` is common. If some of those answers actually argue for neither endpoint, a forced trichotomy could overstate `both`.

## Completed results

| Condition | n | Left-only | Both | Right-only | None | Changed from primary |
|---|---:|---:|---:|---:|---:|---:|
| Replication of WaPo | 150 | 82.0% | 6.7% | 11.3% | 0.0% | 14 |
| No Word Limit | 150 | 84.0% | 6.0% | 10.0% | 0.0% | 44 |
| No System Prompt | 150 | 54.0% | 42.7% | 3.3% | 0.0% | 32 |
| No Fringe Questions | 95 | 36.8% | 57.9% | 5.3% | 0.0% | 22 |

The physical run contains 450 successful judgments. It emitted `none` zero times. Therefore, this run does not support the specific hypothesis that refusals, irrelevant responses, or purely descriptive answers were forced into `both` by the original trichotomy.

The secondary 5.6-Sol judge scored by different criteria for sensitivity analysis purposes: if a response suggested the left-leaning response as its primary answer it was counted as left-leaning, even if it also provided right-leaning perspectives as part of the response. In doing so, the secondary judge disagreed with the original label for 90 of 450 physical responses. The 21 changes in No Fringe Questions are a derived subset and are not additional observations. In the largest shift, No Word Limit moved from 62.0% left / 35.3% both / 2.7% right under the primary judge to 84.0% / 6.0% / 10.0% under the four-label prompt. No System Prompt moved from 34.0% / 64.0% / 2.0% to 54.0% / 42.7% / 3.3%. Note that this procedure is in contrast with the Washington Post's methodology, which scores "both" if arguments for both sides are mentioned, regardless of their relative strength, in line with the primary GPT-5.6 Sol judge's approach.

These changes cannot be attributed to `none`, which was unused. The robustness call changes the category instructions and makes a new stochastic judgment, so it measures their combined effect. It does not identify how much comes from wording, category framing, or ordinary within-judge variability. The large shifts show that the primary scores are conditional on the exact judging procedure. They do not justify silently replacing the primary chart with the robustness run.

The [stratified long-response audit](long-response-label-audit.md) provides a different check: its reviewer confirmed all 20 sampled long-response `both` labels as containing recognizable considerations for both endpoints. The contrast between that audit and the automated re-judge is another reason to treat automated labels as measurement-dependent. The audit itself is small, non-blinded, and single-reviewer.

## Reproduce with new API calls

With `OPENAI_API_KEY` set:

```bash
npm run rejudge-four-label -- --output data/four-label-robustness-new
```

The resumable harness re-judges all 450 physical responses using GPT-5.6 Sol at medium reasoning effort and allows `left`, `right`, `both`, or `none`. It writes:

- `judgments.jsonl`: every successful or failed attempt, keyed to the original response;
- `summary.csv`: arm-level four-category counts and percentages;
- `topic-summary.csv`: topic-level results;
- `disagreements.csv`: cases whose new label differs from the primary trichotomy; and
- `manifest.json`: exact judge prompt and run settings.

The archived run is under `data/four-label-robustness/`. Its JSONL contains 634 records: 184 retained network-failure attempts and 450 successful judgments. Summaries filter to one successful result per response key. The manifest records the exact judge prompt, requested model, reasoning effort, and source paths.
