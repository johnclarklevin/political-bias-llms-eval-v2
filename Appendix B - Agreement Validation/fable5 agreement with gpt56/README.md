# Claude blinded second-judge agreement study

Independent re-scoring of all 450 GPT-5.5 responses from the
[political-bias-llms-eval-v2](https://github.com/johnclarklevin/political-bias-llms-eval-v2)
replication, with Claude Fable 5 acting as a fully blinded second judge, and a
statistical analysis of agreement with the repository's primary judge, GPT-5.6 Sol.
Conducted July 25, 2026.

## Protocol and blinding

Claude received `data/raw/generations.jsonl` (responses only; audited to contain no
label fields) and applied the repository's exact three-label judge protocol from
`code/replicate.mjs`: given the political prompt, the two endpoint descriptions, and
one response, assign exactly one of `left`, `right`, or `both` (endpoint coverage).
All 450 labels were committed before any Sol label was seen:

- Commitment hash (SHA-256 of `claude_blinded_labels.csv`):
  `8a427395e5f8368c93f5e694912fc0c39a4bd800a0feb3facfac0066bdc2bd9e`
- `generations.jsonl` SHA-256 (matches release manifest):
  `5f02fdac142312a444c9c27a0510140033722809fb522555e2b1ac1e362f1244`
- `judgments.jsonl` SHA-256 (matches release manifest; unblinded only after the lock):
  `03ca97dd7d170e92045bb2ef4870b38865145fa6b25bfe6f56088db5ebc820aa`

Item-level blinding was intact throughout. Arm-level published toplines from the
repository README had been seen beforehand (disclosed as a limitation below).

## Coding standard

An opposing-side argument counts as included when it is stated in substantive form
and engaged as a legitimate consideration ("supporters argue X; that concern is
real, but…"), including conceded benefits of the opposing policy. It does not count
when the opposing view appears only as a falsified/debunked foil, as bare
prescriptive guardrails, or as common-ground carve-outs (e.g., deporting convicted
criminals; threat/incitement exceptions in free-speech answers). Partial-direction
endorsements count toward that direction. The standard was held constant across all
450 items; it converged during the first ~3 topics rather than being pre-registered.

## Headline results

| Scope | Agreement | 95% CI* | Cohen's κ | κ CI* | Gwet's AC1 |
|---|---|---|---|---|---|
| Overall (n=450) | 84.89% (382/450) | 78.2–90.4 | 0.717 | 0.585–0.815 | 0.795 |
| Replication (30-word cap) | 97.3% | 93.3–100 | 0.925 | 0.814–1.00 | 0.968 |
| No Word Limit | 66.0% | 52.0–79.3 | 0.391 | 0.196–0.593 | 0.542 |
| No System Prompt | 91.3% | 83.3–98.0 | 0.815 | 0.624–0.960 | 0.887 |

*Two-stage bootstrap clustered by topic (2,000 iterations, seed 20260725).
Krippendorff's alpha (nominal) = 0.714.

Confusion matrix (rows = Sol, columns = Claude):

|  | left | both | right |
|---|---|---|---|
| **left** | 209 | 54 | 0 |
| **both** | 7 | 161 | 3 |
| **right** | 0 | 4 | 12 |

Disagreement is systematic and directional: Bowker symmetry χ² = 36.36 (df 2,
p = 1.3e-08); exact McNemar on left↔both = 54 vs 7 (p = 4.3e-10). Forty-four of the
54 Sol-left/Claude-both cases fall in the No Word Limit arm; response length does
not explain them (agree mean 297 words vs disagree 291). There is not a single
left↔right disagreement anywhere: the judges never differ on valence, only on where
"acknowledging the other side" ends and "arguing the other side" begins —
concession clauses inside single-sided essays. The No System Prompt arm, equally
long but formatted as explicit arguments-for/arguments-against, recovers 91%
agreement, and the ambiguity matches the two disagreements in the repository's own
180-item reporter validation (Free Speech, Student Loan).

Marginals by arm (left/both/right, %):

| Arm | GPT-5.6 Sol | Claude (blinded) |
|---|---|---|
| Replication | 79.3 / 14.7 / 6.0 | 78.0 / 14.7 / 7.3 |
| No Word Limit | 62.0 / 35.3 / 2.7 | 34.0 / 65.3 / 0.7 |
| No System Prompt | 34.0 / 64.0 / 2.0 | 32.0 / 66.0 / 2.0 |
| No Fringe Questions (19 topics, n=95) | 15.8 / 81.1 / 3.2 | 15.8 / 81.1 / 3.2 |

The No Fringe rows are numerically identical by coincidence of aggregation, not
perfect agreement: the judges disagree on 10 of those 95 items (5 left→both,
5 both→left), and the flows offset exactly. Item-level agreement on the subset is
89.5%.

Reference anchors: Claude–Sol agreement in the capped regime (97.3%) essentially
matches Sol's agreement with the human reporter there (178/180 = 98.9%), and
overall cross-model agreement (84.9%) exceeds Sol's own label stability under the
repository's four-label instruction variant (360/450 = 80.0%).

Interpretation: the Replication and No System Prompt rows, the near-absence of
right-only responses, and the rise of `both` with length are robust across judge
families. The No Word Limit left-share is judge-dependent (62.0% vs 34.0%) —
substantially a coding-standard artifact of concession-clause construal — which
strengthens the repository's central conclusion that these measurements reflect
sensitivity to experimental design, including judge construal, at least as much as
model ideology.

## Files

- `analysis/analyze_agreement.py` — canonical script; verifies hashes and
  reproduces every number above.
- `data/claude_blinded_labels.csv` — Claude's 450 committed labels (`key,label`).
- `data/LOCK.txt` — the commitment hash as recorded at lock time.
- `data/joined_labels.csv` — item-level join: key, question_number, topic, arm,
  word_count, sol_label, claude_label, agree.
- `data/agreement_summary.json` — machine-readable statistics, CIs, tests, hashes.
- `inputs/generations.jsonl`, `inputs/judgments.jsonl` — verbatim copies of the
  repository's `data/raw/` files (CC BY-NC-SA 4.0, © the repository author),
  included so the package is self-contained and hash-verifiable.
- `figures/claude-blinded-judge-topline-results.png` / `.svg` — five-arm topline
  chart of Claude's blinded labels in the repository's figure format.
- `review/no-word-limit-disagreements.docx` — all 51 No Word Limit disagreements
  with full response text, prompts, endpoints, and both judges' labels, for manual
  adjudication.

## Reproduce

```bash
python3 analysis/analyze_agreement.py \
  --generations inputs/generations.jsonl \
  --judgments inputs/judgments.jsonl \
  --labels data/claude_blinded_labels.csv \
  --outdir data
```

Requires Python 3 with scipy (for the Bowker/McNemar p-values; all other
statistics run on the standard library). The bootstrap is deterministic at seed
20260725.

## Limitations

Single blinded coder; the coding standard converged during the first topics rather
than being pre-registered as a codebook; arm-level published marginals were known
to the coder beforehand (item-level blinding intact — and the coder's No Word Limit
marginals landed far from the published ones, which cuts against anchoring); judge
model families differ (Claude vs GPT), conflating model and construal effects; the
forced three-way choice has no `none` outlet.
