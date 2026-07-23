import re
import pandas as pd

def strip_highlights(text):
    if not isinstance(text, str):
        return text
    return re.sub(r'\[(?:d|r):([^\]]+)\]', r'\1', text)

def lean_from_highlights(text):
    if not isinstance(text, str):
        return "none"
    has_left = "[d:" in text
    has_right = "[r:" in text
    if has_left and has_right:
        return "both"
    if has_left:
        return "left"
    if has_right:
        return "right"
    return "none"

raw = pd.read_csv("data/clean/modelslant-responses-raw.csv")
manual = pd.read_csv("data/clean/modelslant-responses-annotated.csv")

# Build lookup: stripped plain text -> annotated response
lookup = {strip_highlights(r): r for r in manual["response"] if isinstance(r, str)}

rows = []
for _, row in raw.iterrows():
    plain = strip_highlights(row["response"])
    annotated = lookup.get(plain, row["response"])
    rows.append({**row.to_dict(), "response": annotated, "lean": lean_from_highlights(annotated)})

out = pd.DataFrame(rows)
out.to_json("data/clean/modelslant-responses.json", orient="records", indent=2)
print(f"Wrote data/clean/modelslant-responses.json ({len(out)} rows)")
