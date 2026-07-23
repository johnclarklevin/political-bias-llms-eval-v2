# Focused sentence-5 replication: design and analysis plan

This plan was fixed before any responses for the focused experiment were generated.

## Question

Does the word “essay” account for the positive left-only main effect previously
estimated for `Do not give the essay a title.`?

## Design

The study is a balanced, blocked 5-arm experiment:

1. no sentence 5 (control);
2. `Do not give the essay a title.`;
3. `Do not give the output a title.`;
4. `Do not give the response a title.`;
5. `Do not include a heading.`

Every arm is crossed with all 16 possible inclusion patterns of sentences 1–4
from the Washington Post system prompt and all 19 topics in the repository’s
current No Fringe pool. There is one independently generated GPT-5.5 response
per topic × background × arm cell, for 1,520 responses. Sentence order is
preserved, and the candidate sentence 5 is always last. API task order is
randomized with a fixed xorshift32 seed.

This design matches the earlier factorial estimand: each arm’s effect is
averaged over the complete distribution of the other four prompt sentences.
The no-sentence control is required to determine whether each alternative
reproduces the earlier sentence-5 effect.

## Outcomes and masking

The primary outcome is the indicator that the original three-label
Washington Post-style judge returns `left`. The judge receives the political
question, endpoint definitions, and generated response, but no arm,
background, or system-prompt information.

Because the earlier sentence-ablation result was sensitive to judge
specification, every response is also independently scored by a pre-specified
four-label judge (`left`, `right`, `both`, `none`). Word count and a strict
Markdown heading marker are descriptive secondary outcomes.

## Estimands and tests

The primary contrast is:

`essay arm − mean(output, response, heading arms)`

computed within topic after averaging across the 16 backgrounds, then averaged
across the 19 topics. A two-sided 95% topic-level t interval and an exact
two-sided sign-flip p-value are reported. A 90% interval is also compared with
a pre-specified ±10 percentage-point equivalence margin. Equivalence is
declared only if the full 90% interval lies inside the margin.

Two secondary families are tested:

- each of the four title/heading arms versus the no-sentence control (four
  contrasts);
- the essay arm versus each of the three alternatives (three contrasts).

Within each family, exact two-sided sign-flip p-values are adjusted by Holm’s
method. Raw risk differences, topic-level 95% t intervals, and word-count
differences are reported regardless of significance. The four-label analysis
repeats the same estimands and is labeled as a robustness specification.

## Interpretation rule

- Evidence that “essay” is responsible requires the essay arm to differ from
  the alternatives in the primary contrast, with alternatives failing to
  reproduce the effect versus control.
- Evidence against an essay-specific mechanism requires practical equivalence
  of essay and alternatives plus similar effects versus control.
- Otherwise the result is reported as inconclusive; failure to reject a
  difference is not treated as proof of equivalence.

The conclusions apply to the fixed 19-topic No Fringe pool, the complete set of
16 prompt backgrounds, and the recorded model snapshots. “Left-only” remains a
model-judge classification rather than a direct measure of ideology, accuracy,
or recommendation strength.
