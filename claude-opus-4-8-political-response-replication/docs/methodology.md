# Methodology and limitations

## Design

This project replicates the Washington Post political-response experiment for **Claude Opus 4.8** (Claude API model ID `claude-opus-4-8`) and tests how the topline classification shares change when parts of the original design are removed. All responses are classified by **Claude Fable 5** (`claude-fable-5`).

The frozen source is the Washington Post repository [`washingtonpost/political-bias-llm-eval`](https://github.com/washingtonpost/political-bias-llm-eval) at commit `a8cf5914fb0a71836ef8ab838537863ee85234b9`, vendored under `vendor/washington-post-source/`, and the related article ["Are ChatGPT and other AI chatbots politically biased? We tested them."](https://www.washingtonpost.com/technology/interactive/2026/06/24/are-ai-chatbots-like-chatgpt-politically-biased-we-tested-them/) The 30 topics, exact prompts, and normalized left/right endpoint descriptions come from the frozen source and are snapshotted in `config/inputs.json`.

**Prompt fidelity note.** The prompts in `config/inputs.json` byte-match the frozen raw source file `vendor/washington-post-source/data/raw/output_topics.json` for all 30 topics. The Post's *cleaned* endpoints file, `data/clean/modelslant-topic-endpoints.csv`, normalizes three prompts (comma and quote-style changes in "DEI Programs" and "PC Language," and a shortened "School Vouchers" wording). This replication uses the raw-source wording and did not paraphrase, repair capitalization, normalize punctuation, or reverse alternatives.

### Conditions

| Condition | System treatment | Physical generations |
|---|---|---:|
| Replication of WaPo | Exact original 30-word system prompt | 150 |
| No Word Limit | Original system prompt minus its first sentence | 150 |
| No System Prompt | Top-level `system` field omitted entirely | 150 |
| No Fringe Questions | Derived subset of the No System Prompt responses | 0 (derived) |

Each physical condition contains five independent single-turn samples for each of the 30 topics: 450 physical generations and 450 primary judgments in total. **No Fringe Questions is an analysis subset, not an independently generated or independently randomized arm**: it deterministically reuses the 95 blank-system responses whose topics pass the documented 30% two-party-support screen (assessment v1.1: questions 1, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 24, 25, 26, 27, 30; see [`no-fringe-questions.md`](no-fringe-questions.md), including the disclosed post-hoc v1.1 revision that added questions 15 and 30 on proxy polling grounds).

### API configuration

All requests use the native Claude Messages API (`POST https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`), one independent single-turn request per sample, no tools, no prompt caching, no web search, no multi-turn history, no prefills, and no citations.

- **Generation** (`claude-opus-4-8`): `max_tokens: 8192` in every physical condition (a ceiling that does not bind ordinary responses); `thinking` not set (on Opus 4.8, omitting the field runs without adaptive thinking); `output_config.effort` not set; `temperature`, `top_p`, and `top_k` not set (Opus 4.8 rejects non-default values).
- **Judgment** (`claude-fable-5`): `max_tokens: 4096`; `output_config: {"effort": "medium"}` to match the GPT replication's judge configuration. Fable 5 has always-on adaptive thinking that cannot be disabled. `temperature`, `top_p`, and `top_k` not set; summarized thinking not requested; only visible text blocks are read, and hidden reasoning is neither stored nor reconstructed.

The Claude API exposes no experiment sampling seed for these models, so the experiment is intentionally stochastic; the fixed seed `20260722` orders the task list only, interleaving conditions over time. Responses are preserved exactly: no trimming to 30 words, no rewriting, no removal of caveats, and no discarding of refusals. Word counts use the whitespace-token rule shared with the GPT-5.5 package (trim, then split on Unicode whitespace runs). Violations of the 30-word cap are flagged, disclosed, and never repaired. Truncated responses (`stop_reason == "max_tokens"`) are not scored; the attempt is recorded and retried at a larger ceiling with the retry documented.

### Scoring

The judge receives the political prompt, the two normalized endpoint descriptions, and the response — never the producing model's identity or the generation condition. The forced answer set is exactly `left`, `right`, or `both`. The raw visible answer is stored in full; the first whitespace-delimited token is used only when it is exactly one of the three labels, and anything else is marked invalid and retried. The count of raw answers that were not exactly a single label is reported even when their first token was usable.

Reporting labels: `left` → Left-only, `both` → Both, `right` → Right-only. **The labels measure the presence of arguments matching the supplied endpoint descriptions.** They do not measure equal emphasis, neutrality, endorsement, the final recommendation, factual accuracy, or sentiment.

### Judge validation

Before treating Fable's labels as reliable, the same 180-row validation used in the GPT package is run: human-labeled responses (with their `[d:...]`/`[r:...]` annotation markers stripped, retaining the enclosed text, and with `source_model` and `human_label` withheld from the judge) are classified by Fable 5 and compared with the human labels. Accuracy, invalid counts, the actual-by-predicted confusion matrix, and per-label precision/recall are reported in `data/judge-validation/summary.json`. Experiment labels were not modified after seeing validation results.

## Limitations

- **Purposive topic selection.** The 30 prompts are purposively selected, not a probability sample of political questions. No result generalizes to "political questions" as a population.
- **Asymmetric prompts and endpoints.** Some original prompts and endpoint pairs are asymmetrical or pair a mainstream position with one that has little support in one party; the No Fringe screen addresses this only partially.
- **The word cap is a treatment.** The 30-word cap materially restricts the room to mention both endpoint arguments, so cap-condition results confound model behavior with the length constraint.
- **`both` means coverage.** A `both` label indicates each endpoint was argued at least once; it does not indicate balance, equal weight, neutrality, or endorsement.
- **Forced-choice labels.** The label set has no `neither`, `unclear`, `refusal`, or `neutral` category; every scored response is forced into one of three classes.
- **Judge dependence.** Fable's scores depend on the supplied endpoint descriptions and on judge behavior, both of which embed judgment calls.
- **Same-family judge effect.** Fable 5 and Opus 4.8 are both Anthropic models. High agreement with human labels in the validation set does not eliminate possible same-family scoring effects.
- **Comparator differences.** The Washington Post row uses one reporter-coded response per topic; the local rows use five Fable-coded responses per topic. Their comparison is descriptive, not a controlled contrast.
- **Threshold rigidity.** The hard 30% polling threshold does not propagate polling sampling error or uncertainty in proxy mappings; threshold and evidence-fit sensitivity sets are reported instead.
- **Stochastic outputs.** API outputs are stochastic and the Claude API provides no experiment sampling seed here; repetition- and bootstrap-based sensitivity analyses summarize the resulting variability.
- **Disclosure.** Any refusal, truncation, retry, missing cell, or served-model mismatch observed during execution is disclosed in [`results.md`](results.md) and in the integrity audit.
- **Interpretation.** The category shares alone are not proof that Claude Opus 4.8 is intrinsically left-wing, right-wing, or unbiased. They describe how one classifier labels one model's responses to one purposive question set under specific instructions.

## Uncertainty summaries

Row-level Wilson intervals and a two-stage nonparametric bootstrap (resampling topics, then responses within sampled topics; 40,000 iterations; fixed local seeds) are reported in `data/sensitivity/`. Because topics are purposively selected, bootstrap intervals are robustness summaries under a topic-exchangeability assumption, not design-based confidence intervals for all political questions.
