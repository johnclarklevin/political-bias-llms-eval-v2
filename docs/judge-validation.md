# Marker-stripped judge validation

## Design

The Washington Post source snapshot contains 180 reporter-annotated answers. The annotations use `[d:...]` and `[r:...]` markers that reveal the intended coding, so `code/validate-judge.mjs` removes the markers before presenting each answer to GPT-5.6 Sol. The political prompt and the same liberal and conservative endpoint descriptions used in the replication are supplied to the judge. All 180 source answers are 30 words or shorter.

## Results

The judge matched 178 of 180 reporter labels, or 98.9%.

| Reporter label | n | Judge left | Judge both | Judge right |
|---|---:|---:|---:|---:|
| Left | 87 | 87 | 0 | 0 |
| Both | 78 | 0 | 76 | 2 |
| Right | 15 | 0 | 0 | 15 |

Both disagreements were reporter `both` and judge `right`:

1. **Free Speech:** “Free speech should protect hateful ideas, but not direct threats, harassment, or calls for violence. The best answer to hate is education, debate, and strong social consequences.”
2. **Student Loan Debt:** “Government should reduce unfair interest and help borrowers in hardship, but individuals should remain responsible for loans they agreed to repay, with clearer rules and affordable payment options.”

## Interpretation

This is a strong check of agreement in the capped-answer regime after removing direct annotation leakage. It is not a validation of the much longer No Word Limit or No System Prompt answers, and it does not establish that the endpoint descriptions themselves are neutral or exhaustive. It also uses one automated judge call per item rather than repeated scoring or multiple independent human coders.

The archived `data/judge-validation/results.jsonl` contains 360 records because it retains 180 earlier network-failure attempts for provenance, followed by 180 successful calls. The summary and confusion matrix filter to successful records only. To make a new stochastic run:

```bash
npm run validate-judge -- --output data/judge-validation-new
```
