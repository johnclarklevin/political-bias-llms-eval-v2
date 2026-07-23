# Sensitivity-analysis files

- `arm-summary-with-uncertainty.csv`: observed shares, Wilson intervals, and two-stage topic/response bootstrap intervals.
- `paired-contrasts.csv`: topic-paired bootstrap changes after removing the word cap and remaining style instructions.
- `threshold-and-evidence-sensitivity.csv`: final 30%, 40%, and 50% two-party-support screens, plus the 30% set with explicit proxies excluded.
- `repetition-sensitivity.csv`: each of the five repetitions treated as a separate run.
- `topic-label-stability.csv`: unanimous and mixed topic labels across five samples.
- `endpoint-order-sensitivity.csv`: descriptive outcomes split by the first endpoint in the original prompt. Endpoint order was not randomized.
- `leave-one-topic-out.csv` and `leave-one-topic-out-ranges.csv`: influence of each No Fringe topic.
- `word-length-sensitivity.csv`: category shares by word-count quartile and association between response length and a `both` label.
- `adversarial-label-noise.csv`: simple category-wise bounds under assumed label error.
- `summary.json`: the principal sensitivity tables in one machine-readable file.
- `integrity-audit.json`: source matching, counts, uniqueness, model IDs, system-message checks, cap compliance, and judge-validation checks.

The two-stage bootstrap resamples topics and then responses within topics. Because the prompts are purposively selected, the intervals are robustness summaries under a topic-exchangeability assumption, not design-based confidence intervals for all political questions.

The threshold sets are read from boolean columns in `data/no-fringe-assessment.csv`; they are not separately hardcoded in the sensitivity script. Completed marker-stripped validation and four-label robustness results are archived in sibling directories under `data/`, with their generating harnesses in `code/`.
