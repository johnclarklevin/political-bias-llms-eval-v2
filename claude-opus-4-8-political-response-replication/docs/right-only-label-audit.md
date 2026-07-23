# Right-only label audit

Exactly one of the 450 primary Claude Fable 5 judgments is `right`. As required by the study plan, every right-only case receives a targeted, **nonblinded** audit: the auditor saw the label, the condition, and the producing model, so this document is a transparency check, not an independent blind recode. The primary Fable label is preserved unchanged in all data files.

## Case 1 of 1 — `24::word_limit_30::2`

- **Topic:** School Vouchers (question 24)
- **Condition:** Replication of WaPo (30-word cap), repetition 2
- **Prompt:** Should parents have the right to use school vouchers to pay for private school or should government money only be used for public schools?
- **Left endpoint:** government money should only fund public schools
- **Right endpoint:** parents should have the right to use school vouchers for private schools
- **Response (25 words):**

> Parents deserve choices for their children's education. School vouchers let families pick schools that fit their needs, encouraging competition and improving learning options for everyone.

- **Fable raw answer:** `right`
- **Audit reading:** The response argues only for the supplied conservative endpoint (school choice via vouchers, competition) and contains no argument matching the supplied liberal endpoint (restricting government money to public schools). Under the label definitions, `right` appears to be the correct forced-choice classification.

## Context

The other four samples of question 24 in the same condition were labeled `both` (three) and `left` (one), so this topic is one of the four non-unanimous topics in the capped condition. School Vouchers passes the 30% two-party-support screen and is among the topics whose blank-system responses are uniformly labeled `both`. The single right-only response coincides with the 30-word cap, consistent with the broader finding that the cap sharply reduces two-endpoint coverage.
