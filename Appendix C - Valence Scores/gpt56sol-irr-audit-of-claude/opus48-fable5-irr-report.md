# Claude Opus 4.8 re-score and inter-rater reliability audit

Date: 2026-07-26  
Repository revision evaluated: `66163caf33f1c5ac468e11a8807b52d911c8cd1e`

## Executive result

The two requested Appendix C folders contain the same 95 Claude Opus 4.8 responses, scored under different instruments. I read each response once and independently assigned both a seven-band score and a 0–10 balance score under the respective published rules.

Agreement with Claude Fable 5 was rubric-dependent:

| Reliability measure | Seven-band rubric | 0–10 rubric |
|---|---:|---:|
| Exact agreement | 57.9% (95% CI 38.9–75.8%) | 67.4% (49.5–84.2%) |
| Within one category | 100.0% | 100.0% |
| Cohen κ, unweighted | 0.306 (0.114–0.535) | 0.509 (0.239–0.753) |
| Cohen κ, linear weighted | 0.347 (0.137–0.571) | 0.637 (0.361–0.826) |
| Cohen κ, quadratic weighted | 0.415 (0.177–0.629) | 0.775 (0.521–0.901) |
| ICC(A,1), absolute agreement | 0.418 (0.178–0.631) | 0.777 (0.524–0.902) |
| Spearman ρ | 0.504 (0.309–0.684) | 0.735 (0.494–0.896) |

The seven-band results indicate modest agreement on the exact threshold between “Centrist” and a mild directional tilt. The 0–10 results indicate materially stronger ordinal and absolute agreement. Crucially, every disagreement in both arms was only one category apart: there were no large divergences or opposite-pole ratings.

## Re-score distributions

### Seven-band rubric (`opus48-no-fringe-leanings`)

| Band | Value | This re-score | Fable 5 |
|---|---:|---:|---:|
| Far-left | −3 | 0 | 0 |
| Solidly left | −2 | 0 | 0 |
| Center-left | −1 | 44 | 15 |
| Centrist | 0 | 37 | 77 |
| Center-right | +1 | 14 | 3 |
| Solidly right | +2 | 0 | 0 |
| Far-right | +3 | 0 | 0 |

Mean score was −0.316 for this re-score and −0.126 for Fable 5. The paired difference was −0.189 (topic-cluster 95% CI −0.432 to +0.063). An exact two-sided sign-flip test over the 19 topic means did not reject a zero mean difference (`p = 0.188`).

The confusion structure is especially informative. All 15 Fable center-left ratings were also center-left here, and all three Fable center-right ratings were also center-right here. The 40 disagreements consisted entirely of 29 Fable-centrist responses scored center-left here and 11 Fable-centrist responses scored center-right here. Thus, the raters did not disagree about direction once Fable detected a tilt; they disagreed about how readily asymmetric factual framing should move a response out of “Centrist.”

### 0–10 rubric (`opus48-no-fringe-skew`)

| Score | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| This re-score | 0 | 0 | 0 | 9 | 35 | 37 | 12 | 2 | 0 | 0 | 0 |
| Fable 5 | 0 | 0 | 0 | 10 | 18 | 61 | 4 | 2 | 0 | 0 | 0 |

Mean score was 4.611 here and 4.684 for Fable 5. The paired difference was −0.074 (topic-cluster 95% CI −0.305 to +0.158; exact cluster sign-flip `p = 0.598`). There is no clear evidence of a systematic rater-location shift.

There were 64 exact matches and 31 adjacent-category disagreements. Most disagreements again concerned whether a no-verdict answer was exactly balanced (`5`) or showed a minor preference (`4` or `6`).

## Where the judgments diverged

Four topics account for 20 of the 31 disagreements on the 0–10 rubric and produced five-for-five one-step disagreements on both scales:

- **Birthright Citizenship:** I treated the unqualified constitutional text, precedent, and administrability claims as a mild left-endpoint tilt; Fable treated them as descriptive context within a balanced answer.
- **Mass Deportations:** I treated the concrete feasibility, economic, and humanitarian costs—followed by targeted-removal/legalization syntheses—as mildly closer to allowing most people to remain; Fable treated the values-dependent conclusion as balanced.
- **Student Loan Debt:** I treated the more detailed fairness, regressivity, root-cause, and moral-hazard case, plus targeted-relief alternatives, as a mild right-endpoint tilt; Fable treated the middle-ground close as balanced.
- **Tariffs:** I applied the rubric’s evidence-leans-one-way rule to repeated statements that mainstream economics opposes broad tariffs, while allowing narrow strategic exceptions; Fable kept these responses balanced on the 0–10 scale.

This pattern is a threshold disagreement, not a left-versus-right inversion. My re-score operationalized “minor preference” more sensitively whenever the response’s own factual synthesis asymmetrically strengthened one side, even if the final paragraph declined to choose.

## Statistical method

- Unit: 95 responses, nested as five repetitions within each of 19 topics.
- Primary reliability measures: exact agreement, Cohen’s unweighted κ, linearly and quadratically weighted κ, and ICC(A,1) absolute agreement.
- Supplementary measures: Spearman rank correlation, left/center/right agreement and κ, and Gwet AC2. Linear AC2 was 0.786 for the seven-band rubric and 0.891 for the 0–10 rubric; these higher values reflect AC2’s different handling of concentrated category prevalence and should not replace the primary κ results.
- Uncertainty: 10,000 topic-cluster bootstrap replicates with all five within-topic repetitions kept together; deterministic seed `20260726`.
- Mean-shift test: exact two-sided sign flipping over all `2^19` assignments of the 19 topic-mean paired differences.
- No pooled κ was calculated across arms because the scales and operational definitions differ and the same texts would be duplicated.

## Blinding limitation

The row-level scoring pass did not display Fable’s per-response score or rationale alongside any response, and my 190 judgments were fixed before the row-level join. However, while locating the rubrics I had already seen Appendix C’s aggregate and topic-level summaries. This is therefore **row-level masked scoring with aggregate/topic priors**, not a fully blind confirmatory replication. That limitation should travel with any use of these estimates.

Other limitations are a single pass by each AI rater, only 19 independent topic clusters, wide uncertainty intervals, strong concentration in the middle categories, and the absence of a human criterion rater. Inter-rater reliability measures consistency between these two coders; it does not establish construct validity or factual accuracy.

## Audit trail

The companion workbook contains the source responses, both row-level score sets and rationales, formula-backed deltas and confusion matrices, both rubrics, all reliability estimates, and cluster-bootstrap intervals.

Sources:

- [Appendix C — Valence Scores](https://github.com/johnclarklevin/political-bias-llms-eval-v2/tree/main/Appendix%20C%20-%20Valence%20Scores)
- [Source response dataset](https://github.com/johnclarklevin/political-bias-llms-eval-v2/blob/main/claude-opus-4-8-political-response-replication/data/analysis-rows.csv)
