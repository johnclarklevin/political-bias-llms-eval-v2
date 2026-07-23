# Results and sensitivity analysis

## Summary statistics

| Condition | Topics | n | Left-only | Both | Right-only | Mean words |
|---|---:|---:|---:|---:|---:|---:|
| Washington Post Experiment | 30 | 30 | 80.0% | 16.7% | 3.3% | — |
| Replication of WaPo | 30 | 150 | 79.3% | 14.7% | 6.0% | 25.5 |
| No Word Limit | 30 | 150 | 62.0% | 35.3% | 2.7% | 295.2 |
| No System Prompt | 30 | 150 | 34.0% | 64.0% | 2.0% | 254.8 |
| No Fringe Questions | 19 | 95 | 15.8% | 81.1% | 3.2% | 283.9 |

The direct replication closely matches the Washington Post’s main-chart left-only share. Removing the word cap increases `both` by 20.6 percentage points. Removing the remaining style instructions increases it by another 28.7 points.

## Topic-and-response bootstrap

The two-stage bootstrap resamples topics and then responses within sampled topics. Its intervals are robustness summaries under topic exchangeability, not design-based confidence intervals for all political questions.

| Condition | Left-only 95% interval | Both 95% interval | Right-only 95% interval |
|---|---:|---:|---:|
| Replication of WaPo | 64.7–92.7% | 4.0–27.3% | 0.0–15.3% |
| No Word Limit | 46.7–77.3% | 21.3–50.0% | 0.0–7.3% |
| No System Prompt | 18.7–50.0% | 48.0–79.3% | 0.0–7.3% |
| No Fringe Questions | 3.2–30.5% | 65.3–94.7% | 0.0–11.6% |

For the paired prompt contrasts, the bootstrap interval for the change in `both` is +7.3 to +34.7 points when removing the word cap and +14.0 to +44.0 points when removing the remaining style instructions.

## Support-threshold sensitivity

| Topic rule | Topics | Left-only | Both | Right-only |
|---|---:|---:|---:|---:|
| 30% support | 19 | 15.8% | 81.1% | 3.2% |
| 40% support | 16 | 17.5% | 78.8% | 3.8% |
| 50% support | 14 | 12.9% | 87.1% | 0.0% |
| 30%, excluding explicit proxies | 11 | 10.9% | 89.1% | 0.0% |

## Response length

The point-biserial correlation between word count and a `both` label is −0.034 in the capped arm, 0.238 without the cap, and 0.457 with no system prompt. In the blank-system condition, `both` rises from 15.8% in the shortest word-count quartile to 89.2% in the longest. This association is descriptive: topic and response length may share causes.

## Manual verification

The [label-verification sample](label-verification-sample.md) contains 10 left-only and 10 both responses from the capped replication condition, selected systematically before inspecting their text. It includes the exact prompt, endpoints, response, source key, and raw judge output. The complete records are in `data/responses.csv` and `data/raw/`.

The [long-response audit](long-response-label-audit.md) adds a deterministic sample of 10 `both` and five `left` responses from each long-response condition. The reviewer confirmed all 20 sampled long-response `both` labels and disagreed with one of 10 sampled `left` labels. The [right-only audit](right-only-label-audit.md) separately examines every local `right` label. These are non-blinded single-reviewer checks, not estimates from an independent validation sample.

## Scoring-scheme sensitivity

The completed four-label re-judge produced the following results. “Changed” compares each physical response with its primary three-label judgment.

| Condition | n | Left-only | Both | Right-only | None | Changed |
|---|---:|---:|---:|---:|---:|---:|
| Replication of WaPo | 150 | 82.0% | 6.7% | 11.3% | 0.0% | 14 |
| No Word Limit | 150 | 84.0% | 6.0% | 10.0% | 0.0% | 44 |
| No System Prompt | 150 | 54.0% | 42.7% | 3.3% | 0.0% | 32 |
| No Fringe Questions | 95 | 36.8% | 57.9% | 5.3% | 0.0% | 22 |

The 0 `none` results do not support the specific concern that refusals or purely descriptive answers were being forced into `both`. However, 90 of 450 physical labels changed among `left`, `both`, and `right`; the 22 No Fringe changes are a derived subset of those responses. Because this check changes the judge prompt and makes a new stochastic scoring call, it measures the combined sensitivity to category instructions and re-judging—not only the mechanical addition of `none`. The primary chart is therefore retained, and the [full robustness analysis](four-label-robustness.md) is reported alongside it.
