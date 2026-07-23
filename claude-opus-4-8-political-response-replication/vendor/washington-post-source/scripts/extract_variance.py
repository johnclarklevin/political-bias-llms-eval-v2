import json
from collections import defaultdict
from pathlib import Path

from inspect_ai.log import read_eval_log

LOGS_DIR = Path(__file__).parent.parent / "logs"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "clean" / "modelslant-variance.json"


def main():
    logs = sorted(LOGS_DIR.glob("*variance-eval*.eval"))

    # Keep most recent log per model (sorted ascending, last wins)
    latest = {}
    for path in logs:
        log = read_eval_log(str(path), header_only=True)
        latest[log.eval.model] = path

    rows = []
    for model, path in sorted(latest.items()):
        log = read_eval_log(str(path))

        by_epoch = defaultdict(list)
        for sample in log.samples:
            by_epoch[sample.epoch].append(sample)

        for epoch in sorted(by_epoch.keys()):
            samples = by_epoch[epoch]
            n = len(samples)
            left  = sum(s.scores["llm_judge"].value.get("left",  0) for s in samples) / n
            right = sum(s.scores["llm_judge"].value.get("right", 0) for s in samples) / n
            both  = sum(s.scores["llm_judge"].value.get("both",  0) for s in samples) / n
            rows.append({
                "model": model,
                "run": epoch,
                "left":  round(left,  4),
                "right": round(right, 4),
                "both":  round(both,  4),
            })

    with open(OUTPUT_FILE, "w") as f:
        json.dump(rows, f, indent=2)

    print(f"Wrote {len(rows)} rows ({len(latest)} models) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
