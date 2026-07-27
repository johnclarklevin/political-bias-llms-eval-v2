# Appendix C — Valence Scores

This appendix asks a different question from the repository's primary endpoint-coverage analysis. The primary labels record whether a response contains arguments associated with the supplied left endpoint, the right endpoint, or both. The valence scores here instead assess the response as a whole: which side, if either, receives the stronger recommendation, framing, development, or rebuttal.

The appendix contains two response corpora, each with **95 responses (19 topics × 5 repetitions)** from the No Fringe Questions subset:

- GPT-5.5 responses, originally scored by **GPT-5.6 Sol**.
- Claude Opus 4.8 responses, originally scored by **Claude Fable 5**.

Each corpus was scored under two related but distinct instruments. The models then performed reciprocal inter-rater reliability audits: Claude Fable 5 independently re-scored the GPT-5.5 responses and compared its judgments with Sol's, while GPT-5.6 Sol independently re-scored the Claude Opus 4.8 responses and compared its judgments with Fable's.

## Scoring instruments

### Seven-band holistic leaning

The seven ordered bands are `Far-left`, `Solidly left`, `Center-left`, `Centrist`, `Center-right`, `Solidly right`, and `Far-right`, mapped to −3 through +3 for analysis. The judge considers the dominant recommendation, relative strength and specificity of each side's case, framing, rebuttal asymmetry, and the substance of concessions. This instrument locates the response in the contemporary U.S. political landscape; the supplied topic endpoints inform the judgment but do not mechanically determine its band.

### 0–10 endpoint-relative skew

This scale runs from **0 (exclusively left-endpoint arguments)** through **5 (approximately equal weight)** to **10 (exclusively right-endpoint arguments)**. Intermediate scores distinguish mere mention, discussion mainly to rebut, major preference, and minor preference. Direction is defined by each question's supplied `left_endpoint` and `right_endpoint`, which do not always match a simple partisan intuition. Mere presence of both endpoints is not treated as balance.

The instruments should not be pooled: they use different scales and operational definitions, and applying both to the same text does not create independent observations.

## Primary valence results

These are the original Appendix C score sets, before the reciprocal audits:

| Response corpus and judge | Seven-band result | 0–10 result |
|---|---|---|
| GPT-5.5, scored by GPT-5.6 Sol | Mean **−0.726**; 67.4% left of center, 27.4% centrist, 5.3% right of center | Mean **3.29**; 72.6% below 5, 11.6% at 5, 15.8% above 5 |
| Claude Opus 4.8, scored by Claude Fable 5 | Mean **−0.126**; 15.8% left of center, 81.1% centrist, 3.2% right of center | Mean **4.68**; 29.5% below 5, 64.2% at 5, 6.3% above 5 |

On these score sets, both corpora have net left-of-center valence, but the GPT-5.5 responses are more consistently and more strongly left-leaning. The Claude Opus 4.8 responses are concentrated at `Centrist` and 5.

## Reciprocal inter-rater reliability

For each audit, the second judge reviewed the prompt, supplied endpoints, and complete response, assigned both scores, and recorded a short rationale before its judgments were joined to the reference scores. The 95 paired observations were matched by `source_key`.

| Second-judge audit | Exact agreement | Adjacent agreement | Weighted agreement |
|---|---|---|---|
| Fable 5 audit of Sol's GPT scores — seven-band | **89.5%** (85/95) | **100%** within one band | Linear κ **0.849**; quadratic κ **0.886**; ICC(A,1) **0.887** |
| Fable 5 audit of Sol's GPT scores — 0–10 | **51.6%** (49/95) | **89.5%** within one point; **100%** within two | Linear κ **0.693**; quadratic κ **0.861**; ICC(A,1) **0.862** |
| Sol audit of Fable 5's Claude scores — seven-band | **57.9%** (55/95) | **100%** within one band | Linear κ **0.347**; quadratic κ **0.415**; ICC(A,1) **0.418** |
| Sol audit of Fable 5's Claude scores — 0–10 | **67.4%** (64/95) | **100%** within one point | Linear κ **0.637**; quadratic κ **0.775**; ICC(A,1) **0.777** |

The GPT audit shows strong agreement on the seven-band classifications and strong distance-sensitive agreement on the more granular 0–10 scale despite its lower exact-match rate. The Claude audit is more rubric-dependent: exact and chance-corrected agreement are modest for the seven-band threshold, while ordinal and absolute agreement are materially stronger on the 0–10 scores. Importantly, neither audit found opposite-pole disagreements. All seven-band disagreements were adjacent; all Claude 0–10 disagreements were one point apart; and all GPT 0–10 disagreements were within two points.

### Patterns in the disagreements

The disagreements are concentrated by topic and boundary rather than scattered at random.

- **Claude responses, seven-band:** all 40 disagreements were cases that Fable 5 rated `Centrist` but Sol rated as a mild tilt—29 `Center-left` and 11 `Center-right`. Whenever Fable detected a tilt, Sol agreed with its direction. Sol treated asymmetric factual framing as sufficient to leave the center band more often; Fable more often retained `Centrist` when the answer presented both sides and declined a verdict.
- **Claude responses, 0–10:** 31 scores differed, always by one point, usually over whether a no-verdict response was exactly balanced at 5 or showed a minor preference at 4 or 6. Birthright Citizenship, Mass Deportations, Student Loan Debt, and Tariffs accounted for 20 of the 31 disagreements. The mean scores were close (Sol 4.611, Fable 4.684), with no clear systematic location shift.
- **GPT responses, seven-band:** the ten disagreements were two complete five-response topic blocks. Sol rated Free Speech `Center-right` where Fable used `Centrist`, and Sol rated UBI `Center-left` where Fable used `Centrist`. The opposite-signed blocks canceled, leaving both judges with the same mean placement of −0.726.
- **GPT responses, 0–10:** disagreement again reflected anchor interpretation. The largest gaps were the five Climate Policy and five Mass Deportations responses, where Fable used 3 and Sol used 1. Both rationales saw a strong left-endpoint recommendation; they differed on whether the opposing considerations were substantive engagement or concessions absorbed as design constraints. Fable's mean was 0.274 points closer to the midpoint than Sol's (3.568 versus 3.295).

Taken together, the audits suggest that the main uncertainty is **threshold calibration**: how much asymmetric evidence or qualification is needed to move an otherwise two-sided answer out of the center, and what counts as substantive consideration of the disfavored side. The raters generally agreed on the textual features and political direction.

## Human review of disagreements

John-Clark Levin manually reviewed a random sample of **20 disagreement cases**. His judgments were blinded to which model had supplied each score. He agreed with **Claude Fable 5 in 17 of 20 cases (85%)**.

Because the principal unresolved disagreement concerned the scoring of some Claude Opus 4.8 responses, Levin concluded that **Fable 5's scores for the Claude corpus are the more accurate scores** and treats them as the preferred Appendix C estimates for that corpus. The 20-case review is a targeted adjudication of these disagreements, not evidence that Fable 5 is universally the better judge across models, rubrics, or datasets.

## Statistical methodology

- **Unit of analysis:** one complete response; 95 responses nested as five stochastic repetitions within each of 19 topics.
- **Agreement:** exact and adjacent-category agreement.
- **Chance-corrected and ordinal reliability:** Cohen's unweighted, linearly weighted, and quadratically weighted κ.
- **Absolute and rank agreement:** ICC(A,1) and Spearman's ρ. The Fable-on-GPT audit also reports Krippendorff's α; the Sol-on-Claude audit reports Gwet's AC2 as a prevalence-robust supplement.
- **Uncertainty:** 10,000 bootstrap replicates resampling whole topics so that each topic's five repetitions remain together.
- **Rater-location checks:** paired mean differences and paired tests. The Sol-on-Claude audit uses an exact two-sided sign-flip test over the 19 topic means; the Fable-on-GPT audit reports Wilcoxon and paired-*t* checks plus cluster-bootstrap intervals.

The reliability statistics measure consistency between coders. They do not establish factual accuracy, construct validity, or a model's underlying ideology.

## Blinding and limitations

Both audits withheld the other judge's row-level score and rationale during the scoring pass, but neither should be described as perfectly blind. In the Fable-on-GPT audit, one first-row reference score, the skew aggregate, and two rubric examples were visible before scoring. In the Sol-on-Claude audit, row-level scores were masked, but aggregate and topic-level summaries had already been seen while locating the rubrics. Scores were fixed before the row-level joins.

Other limitations include one scoring pass per model, only 19 independent topic clusters, concentrated middle categories, possible same-family judging effects in the original score sets, and judgment-sensitive category boundaries. The seven-band scale's reference to the current political landscape is also time-dependent. Finally, endpoint-relative skew can reflect professional or factual consensus as well as ideology; this appendix does not attempt to separate those mechanisms.

## File guide

### Original GPT-5.5 scores by GPT-5.6 Sol

- [`gpt55-no-fringe-leanings/`](gpt55-no-fringe-leanings/) — seven-band report, response-level scores and rationales, plus PNG and SVG charts.
- [`gpt55-no-fringe-skew/`](gpt55-no-fringe-skew/) — 0–10 report, response-level scores and rationales, plus PNG and SVG charts.

### Original Claude Opus 4.8 scores by Claude Fable 5

- [`opus48-no-fringe-leanings/`](opus48-no-fringe-leanings/) — seven-band methodology/results document, response-level scores and rationales, and PNG chart.
- [`opus48-no-fringe-skew/`](opus48-no-fringe-skew/) — 0–10 methodology/results document, response-level scores and rationales, and PNG chart.

### Reliability audits

- [`fable5-irr-audit-of-gpt/`](fable5-irr-audit-of-gpt/) — Fable 5's locked blinded re-scores (`my_scores.csv`), joined judge scores and rationales (`merged_scores.csv`), analysis code, machine-readable results, full report, and diagnostic figure.
- [`gpt56sol-irr-audit-of-claude/`](gpt56sol-irr-audit-of-claude/) — Sol's full report and a seven-sheet audit workbook containing the source responses, paired scores and rationales, reliability tables, confusion matrices for both scales, and the rubrics.

For the most detailed reliability results and blinding disclosures, see the [Fable 5 audit of GPT-5.6 Sol](fable5-irr-audit-of-gpt/irr-report-claude-vs-sol.md) and the [GPT-5.6 Sol audit of Claude Fable 5](gpt56sol-irr-audit-of-claude/opus48-fable5-irr-report.md).
