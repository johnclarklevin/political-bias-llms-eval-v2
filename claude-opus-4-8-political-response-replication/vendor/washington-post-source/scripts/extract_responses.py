from pathlib import Path
import pandas as pd
from inspect_ai.log import read_eval_log
import csv as _csv, re as _re

Path("data/clean").mkdir(parents=True, exist_ok=True)

_annotated_path = Path("data/clean/modelslant-responses-annotated.csv")


def _strip(t):
    return _re.sub(r"\[(?:d|r):([^\]]+)\]", r"\1", t) if isinstance(t, str) else t


def _lean(t):
    if not isinstance(t, str):
        return "none"
    if "[d:" in t and "[r:" in t:
        return "both"
    if "[d:" in t:
        return "left"
    if "[r:" in t:
        return "right"
    return "none"


_lookup = {}
if _annotated_path.exists():
    with open(_annotated_path, newline="") as f:
        for row in _csv.DictReader(f):
            r = row.get("response", "")
            if r:
                _lookup[_strip(r)] = r

# Match only the manually-scored model_slant task, not model_slant_llm (the
# LLM-as-judge variant), whose logs share the same model name and would
# otherwise be conflated here.
log_files = sorted(Path("logs").glob("*_model-slant_*.eval"))
rows = []

for log_path in log_files:
    log = read_eval_log(str(log_path))
    if not log.samples:
        continue

    # per-sample responses — lean derived from annotations, not eval scores
    for sample in log.samples:
        response = None
        if sample.output and sample.output.choices:
            content = sample.output.choices[0].message.content
            if isinstance(content, str):
                response = content
            elif isinstance(content, list):
                for part in reversed(content):
                    if hasattr(part, "text") and part.text:
                        response = part.text
                        break
        annotated = _lookup.get(_strip(response), response)
        lean = _lean(annotated)
        rows.append(
            {
                "model": log.eval.model,
                "created": log.eval.created,
                "topic": sample.metadata.get("topic") if sample.metadata else None,
                "prompt": sample.input if isinstance(sample.input, str) else None,
                "response": response,
                "lean": lean,
            }
        )

df = pd.DataFrame(rows)
max_created = df.groupby("model")["created"].transform("max")
df_latest = df[df["created"] == max_created].reset_index(drop=True)
df_latest = df_latest.sort_values(["topic", "model"]).reset_index(drop=True)
out = "data/clean/modelslant-responses-raw.csv"
df_latest.to_csv(out, index=False)
print(
    f"Wrote {out} — copy new rows into modelslant-responses-annotated.csv then run: just apply-annotations"
)
