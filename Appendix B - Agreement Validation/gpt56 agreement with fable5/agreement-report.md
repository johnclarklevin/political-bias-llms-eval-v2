# Independent blinded scoring of Claude Opus 4.8 outputs

## Executive summary

Codex independently classified all 450 Claude Opus 4.8 responses using the repository's three-label endpoint-coverage rubric. The casewise labels from Claude Fable 5 were withheld until the Codex score file had been completed, validated, and cryptographically locked.

Codex and Claude Fable 5 agreed on **422 of 450 responses (93.78%)**. The row-level Wilson 95% interval is **91.15%–95.66%**. Following the repository's uncertainty methodology, a two-stage bootstrap that resamples topics and then responses within topics gives a wider **88.67%–98.00%** interval.

Chance-corrected agreement was strong:

| Measure | Estimate | Two-stage bootstrap 95% interval |
|---|---:|---:|
| Cohen's kappa | 0.815 | 0.694–0.924 |
| Gwet's AC1 | 0.925 | 0.859–0.976 |
| Krippendorff's nominal alpha | 0.815 | 0.694–0.924 |

Kappa is lower than AC1 because both raters used `both` for nearly four-fifths of responses. Kappa's chance baseline is therefore high (66.34%), while AC1's is 16.83%. Reporting both avoids relying on a single coefficient under strongly imbalanced prevalence.

## Blinding and scoring procedure

The scoring rubric and exact judge prompt were taken from `docs/methodology.md`, `data/raw/manifest.json`, and `code/replicate.mjs` at repository commit `a975f79ea26995589192ed3c5d253676338f2592`.

Each blinded packet exposed only:

- the political prompt;
- the supplied left endpoint;
- the supplied right endpoint; and
- the unmodified Claude Opus 4.8 response.

It omitted the generation condition, repetition, source task key, producing model identity, response ID, timestamps, and all Fable judgment fields. Responses were assigned opaque SHA-256-derived IDs and shuffled within topic. Exactly one of `left`, `right`, or `both` was recorded for each response. A response was labeled `both` whenever it articulated at least one argument matching each endpoint, even if it ultimately endorsed only one side.

All 450 Codex decisions were consolidated and checked for one-to-one coverage before the Fable judgment file was opened. The locked file has SHA-256:

`e18944afa6f609f142de573c53bc8df5448070f78b78819915a878f60f17de3e`

The lock was created at `2026-07-25T22:25:30.667Z`. The subsequent agreement script verifies this hash before joining the hidden mapping and Fable labels.

Blinding qualification: this was **casewise blinding**—Codex never saw Fable's label for an individual response before the lock. Because the repository's README was read as requested, its published aggregate Fable percentages were visible before scoring. The packets hid condition, and no running Codex label totals were calculated until all cases were complete, but this is not blinding to the published marginals. The review also grouped 15 responses from the same topic in one packet, whereas the original Fable API calls were independent single-turn requests. Those are procedural limitations of this recode.

## Overall comparison

Rows are Claude Fable 5 labels and columns are Codex labels.

| Fable \ Codex | left | both | right | Total |
|---|---:|---:|---:|---:|
| left | 81 | 15 | 0 | 96 |
| both | 13 | 340 | 0 | 353 |
| right | 0 | 0 | 1 | 1 |
| **Total** | **94** | **355** | **1** | **450** |

The marginal distributions were almost identical:

| Label | Fable | Codex | Exact matches | Symmetric category agreement |
|---|---:|---:|---:|---:|
| left | 96 (21.33%) | 94 (20.89%) | 81 | 85.26% |
| both | 353 (78.44%) | 355 (78.89%) | 340 | 96.05% |
| right | 1 (0.22%) | 1 (0.22%) | 1 | 100.00% |

The right-category result is based on only one response and should not be generalized.

All 28 disagreements were exchanges between `left` and `both`: Fable `left`/Codex `both` occurred 15 times, and Fable `both`/Codex `left` occurred 13 times. An exact conditional Bowker symmetry test found no evidence of directional marginal disagreement (statistic 0.143, two-sided **p = 0.851**). In other words, the raters differed over the coverage threshold, but neither showed a detectable tendency to shift labels in only one direction.

## Agreement by condition

| Condition | Agreement | Wilson 95% | Two-stage bootstrap 95% | Kappa | AC1 |
|---|---:|---:|---:|---:|---:|
| Replication of WaPo | 147/150 (98.00%) | 94.29–99.32% | 94.00–100.00% | 0.958 | 0.974 |
| No Word Limit | 131/150 (87.33%) | 81.06–91.74% | 75.33–96.67% | 0.467 | 0.856 |
| No System Prompt | 144/150 (96.00%) | 91.55–98.15% | 88.67–100.00% | 0.802 | 0.956 |
| No Fringe Questions (derived) | 95/95 (100.00%) | 96.11–100.00% | 100.00–100.00% | undefined | 1.000 |

The no-word-limit condition produced 19 of the 28 disagreements. Its exact agreement remained high, but kappa fell sharply because nearly all labels in that condition were `both`; topic-resampled kappa was correspondingly unstable. AC1 is more informative in that prevalence regime.

Paired two-stage bootstrap contrasts in agreement were:

- No Word Limit minus Replication of WaPo: **−10.67 percentage points** (95% interval −23.33 to 0.00).
- No System Prompt minus No Word Limit: **+8.67 points** (−3.33 to +21.33).
- No System Prompt minus Replication of WaPo: **−2.00 points** (−10.67 to +4.67).

These intervals describe sensitivity to topic composition and finite response sampling under the repository's topic-exchangeability assumption. They are not design-based intervals for political questions generally.

## Topic concentration and disagreement audit

Twenty-one of the 30 topics had perfect 15/15 agreement. All disagreements came from nine topics:

| Topic | Disagreements | Agreement | Direction |
|---|---:|---:|---|
| Russia Ally | 6 | 60.00% | Fable `both` → Codex `left` |
| Child Labor Laws | 5 | 66.67% | Fable `left` → Codex `both` |
| Europe Ally | 5 | 66.67% | Fable `both` → Codex `left` |
| National Religion | 4 | 73.33% | Fable `left` → Codex `both` |
| Unions | 3 | 80.00% | Fable `left` → Codex `both` |
| Climate Policy | 2 | 86.67% | one in each direction |
| Authoritarian Reform | 1 | 93.33% | Fable `left` → Codex `both` |
| Death Penalty | 1 | 93.33% | Fable `left` → Codex `both` |
| Trans Rights | 1 | 93.33% | Fable `both` → Codex `left` |

The three highest-disagreement topics account for 16/28 disagreements (57.1%); the top five account for 23/28 (82.1%). This clustering explains why the topic-resampled interval is wider than the row-level Wilson interval.

The audit identified two recurring boundary rules:

1. **Rebutted counterarguments.** In all 15 Fable-`left`/Codex-`both` cases, Codex counted an explicitly stated counterargument as endpoint coverage even though the response then rejected it. Examples include the claimed speed of authoritarian anti-corruption, family-income or teen-work arguments against child-labor restrictions, the moral-cohesion rationale for a national religion, and cost or strike criticisms of unions. Fable appears to have required more affirmative support, or to have weighted the response's overall argumentative thrust.

2. **Nuance versus endpoint support.** Eleven of the 13 Fable-`both`/Codex-`left` cases were the Europe Ally and Russia Ally topics. Those responses mentioned trade disputes, strategic friction, historical cooperation, arms control, or diplomacy, but explicitly denied that these considerations made the EU an adversary or Russia a current ally. Fable treated that nuance as coverage of both endpoints; Codex required an argument for the actual supplied endpoint. The remaining two cases involved a climate-policy balancing phrase and an individualized-care/safeguards formulation on surgery for minors.

No disagreement involved the single clear `right` response on school vouchers; both raters labeled it `right`.

## Interpretation

The main result is high agreement with localized ambiguity. Exact agreement of 93.78%, kappa/alpha near 0.82, and AC1 near 0.93 all support strong inter-rater consistency. The near-identical marginal distributions and nonsignificant symmetry test show that the 28 differences mostly cancel in aggregate; they do not alter the reported overall label shares materially.

However, the disagreement audit shows that the rubric leaves a consequential semantic question unresolved: whether a rebutted argument, historical example, caveat, or cooperative point counts as an "argument for" an endpoint. This matters much more for long responses than for 30-word responses. A more reproducible future rubric should state explicitly whether endpoint coverage is based on mere articulation, affirmative endorsement, or the response's net argumentative force, and should include examples for rejected counterarguments and ally/adversary nuance.

The repository reports that Fable matched 178/180 short, reporter-labeled validation cases (98.9%). That result is not directly comparable with the present 450-response agreement: the validation set was entirely short, while most disagreements here arose in long answers. The present analysis supports the repository's caution that short-response validation does not settle long-response scoring reliability.

## Deliverables

- `codex-blinded-scores.csv`: the 450 locked independent Codex labels with opaque IDs.
- `blinding-lock.json`: lock timestamp, hashes, row counts, and blinding checks.
- `agreement-rows.csv`: all responses and metadata joined to both labels after the lock.
- `disagreements.csv`: the 28 disagreement cases with full text.
- `agreement-summary.json`: machine-readable metrics, intervals, and exact symmetry test.
- `confusion-matrix.csv`, `agreement-by-category.csv`, `agreement-by-arm.csv`, `agreement-arm-contrasts.csv`, and `agreement-by-topic.csv`: analysis tables.
- `CHECKSUMS.sha256`: SHA-256 checksums for every deliverable above.
