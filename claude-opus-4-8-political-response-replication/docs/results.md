# Results

## Topline

| Condition | Topics | Responses | Left-only | Both | Right-only |
|---|---:|---:|---:|---:|---:|
| Washington Post Experiment | 30 | 30 | 43.3% (13) | 56.7% (17) | 0.0% (0) |
| Replication of WaPo | 30 | 150 | 38.0% (57) | 61.3% (92) | 0.7% (1) |
| No Word Limit | 30 | 150 | 16.7% (25) | 83.3% (125) | 0.0% (0) |
| No System Prompt | 30 | 150 | 9.3% (14) | 90.7% (136) | 0.0% (0) |
| No Fringe Questions | 19 | 95 | 0.0% (0) | 100.0% (95) | 0.0% (0) |

The Washington Post row is recomputed from the vendored frozen source (`modelslant-responses-raw.csv`, `model == "anthropic/claude-opus-4-8"`): one reporter-coded response per topic. The local rows contain five fresh Claude Opus 4.8 responses per topic, classified by Claude Fable 5; No Fringe Questions is the deterministic 19-topic subset of the No System Prompt responses (assessment v1.1; see the revision disclosure below). The Post's separate five-run automated consistency analysis is preserved in [`washington-post-consistency-runs.csv`](../data/washington-post-consistency-runs.csv) as a supplementary comparison (its runs range from 33.3%–43.3% left-only), not as the headline comparator.

## Reading the pattern

Under the Post's exact 30-word system prompt, the fresh replication lands close to the Post's reporter-coded distribution (38.0% vs 43.3% left-only; 61.3% vs 56.7% both). Removing only the 30-word cap raises two-endpoint coverage by 22.0 percentage points (topic-paired bootstrap interval +9.3 to +36.7), and removing the remaining style instructions adds a further 7.4 points (interval −6.7 to +22.0, spanning zero). On the 19 topics where both endpoints hold at least 30% support within their own parties (assessment v1.1), every one of the 95 unconstrained responses covers both endpoints.

These labels measure endpoint coverage under specific instructions. They do not, by themselves, establish that Claude Opus 4.8 is intrinsically left-wing, right-wing, or unbiased.

## Uncertainty

Row-level Wilson 95% intervals and two-stage topic/response bootstrap intervals (40,000 iterations, fixed seeds) for the `both` share:

| Condition | Both | Wilson 95% | Two-stage bootstrap |
|---|---:|---|---|
| Replication of WaPo | 61.3% | 53.3–68.8 | 44.7–77.3 |
| No Word Limit | 83.3% | 76.6–88.4 | 70.0–94.7 |
| No System Prompt | 90.7% | 84.9–94.4 | 80.0–100.0 |
| No Fringe Questions | 100.0% | 96.1–100.0 | 100.0–100.0 |

Because topics are purposively selected, bootstrap intervals are robustness summaries under a topic-exchangeability assumption, not design-based confidence intervals for all political questions. Full tables: [`data/sensitivity/`](../data/sensitivity/README.md).

## Stability and sensitivity highlights

- **Repetitions.** Treating each of the five repetitions as a separate run, the `both` share ranges 56.7%–63.3% (capped), 80.0%–86.7% (no limit), 90.0%–93.3% (blank system), and 100.0% in every repetition of No Fringe Questions.
- **Topic unanimity.** All five samples agree on 26/30 capped topics, 27/30 no-limit topics, 29/30 blank-system topics, and 19/19 No Fringe topics.
- **Support thresholds.** Tightening the two-party-support screen leaves the result unchanged: the blank-system `both` share is 100% at the 30% (19 topics), 40% (16), and 50% (14) thresholds, in the 30% set excluding explicit proxies (11 topics), and in the original v1.0 17-topic set retained for comparison. Left-only responses concentrate entirely in the excluded low-support topics.
- **Endpoint order.** Responses cover both endpoints more often when the liberal alternative appears first in the original prompt (e.g., 81.1% vs 31.7% `both` in the capped condition). Order was not randomized in the source design and is confounded with topic, so this is descriptive only.
- **Response length.** Longer responses are more likely to be labeled `both` (point-biserial r = 0.39 within the capped condition; 0.17 and 0.16 in the uncapped conditions), consistent with the cap operating as a substantive treatment.
- **Label noise.** Adversarial ±1/±2/±5-point error bounds are in [`adversarial-label-noise.csv`](../data/sensitivity/adversarial-label-noise.csv); no qualitative conclusion above depends on shifts of that size.

## Judge validation

On the 180 human-labeled validation rows (annotation markers stripped; model identity and human label withheld), Claude Fable 5 agreed with the human label 178/180 times (98.9% accuracy; Wilson 95% ≈ 96.0–99.7), with 0 invalid answers and 0 raw answers that were anything other than exactly one label. Confusion: one `left` case predicted `both`, one `both` case predicted `right`; per-label precision/recall are all ≥ 0.94 ([`summary.json`](../data/judge-validation/summary.json)). Fable 5 and Opus 4.8 are both Anthropic models, so this agreement does not rule out same-family scoring effects; see [methodology](methodology.md).

## Disclosures

- **30-word-cap violations:** 5 of 150 capped responses exceed 30 whitespace-delimited words (four at 31, one at 32: keys `4::word_limit_30::1`, `12::word_limit_30::5`, `17::word_limit_30::3`, `19::word_limit_30::2`, `19::word_limit_30::5`). They are flagged in the data and were not trimmed, repaired, or excluded. Mean capped length is 27.8 words.
- **Refusals, truncations, retries, missing cells:** none. All 450 generations completed on the first attempt with `stop_reason: "end_turn"`, and all 450 judgments returned a valid label on the first attempt.
- **Model routing:** every generation response reported `model: "claude-opus-4-8"` and every judge response reported `model: "claude-fable-5"`; the integrity check verifies this.
- **Right-only labels:** exactly one (School Vouchers under the 30-word cap); see the [targeted audit](right-only-label-audit.md). The primary label is preserved.
- **Assessment revision (v1.1):** After the primary results were first computed, the project owner revised the No Fringe assessment to include questions 15 (Gay Conversion) and 30 (Universal Basic Income) on proxy polling grounds (Data for Progress crosstabs, June 2025: 43% of Republicans say conversion practices should be allowed and 62% of Democrats say they should be banned; Pew, Aug 2020: 66% of Democrats favor a UBI and 78% of Republicans oppose one). This is a post-hoc change to a pre-registered-style screen and is disclosed as such. Both added topics' blank-system responses were unanimously `both` before the revision, so no label changed; the subset grew from 17 topics (n=85) to 19 (n=95) and the v1.0 subset is retained in the threshold sensitivity table. Details: [no-fringe-questions.md](no-fringe-questions.md).
- **Non-exact judge answers:** 0 of 450 primary judgments and 0 of 180 validation judgments required first-token extraction; every raw answer was exactly `left`, `right`, or `both`.
