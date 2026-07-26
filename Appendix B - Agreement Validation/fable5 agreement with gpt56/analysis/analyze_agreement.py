#!/usr/bin/env python3
"""Inter-judge agreement analysis: Claude (blinded second judge) vs GPT-5.6 Sol.

Reproduces all statistics reported in the study README from the raw inputs.

Usage:
  python analyze_agreement.py \
      --generations inputs/generations.jsonl \
      --judgments inputs/judgments.jsonl \
      --labels data/claude_blinded_labels.csv \
      --outdir data/

Verifies input SHA-256 hashes against the repository release manifest, joins the
two judges' labels, and computes: percent agreement, Cohen's kappa, Gwet's AC1,
Krippendorff's alpha, topic-clustered two-stage bootstrap CIs (seed 20260725),
per-arm breakdowns, the confusion matrix, Bowker's symmetry test, and an exact
McNemar test on the dominant left/both flow. Writes joined_labels.csv and
agreement_summary.json.
"""
import argparse, collections, csv, hashlib, json, math, random, sys

EXPECTED = {
    "generations": "5f02fdac142312a444c9c27a0510140033722809fb522555e2b1ac1e362f1244",
    "judgments": "03ca97dd7d170e92045bb2ef4870b38865145fa6b25bfe6f56088db5ebc820aa",
}
LABELS_LOCK = "8a427395e5f8368c93f5e694912fc0c39a4bd800a0feb3facfac0066bdc2bd9e"
LBL = ["left", "both", "right"]
ARMS = ["word_limit_30", "no_word_limit", "blank_system"]
SEED = 20260725


def sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def stats(pairs):
    n = len(pairs)
    po = sum(a == b for a, b in pairs) / n
    m1 = collections.Counter(a for a, _ in pairs)
    m2 = collections.Counter(b for _, b in pairs)
    pe = sum((m1[c] / n) * (m2[c] / n) for c in LBL)
    kap = (po - pe) / (1 - pe) if pe < 1 else float("nan")
    pi = {c: (m1[c] / n + m2[c] / n) / 2 for c in LBL}
    peg = sum(p * (1 - p) for p in pi.values()) / (len(LBL) - 1)
    ac1 = (po - peg) / (1 - peg)
    return po, kap, ac1


def krippendorff(pairs):
    vals = [v for p in pairs for v in p]
    n = len(vals)
    nc = collections.Counter(vals)
    do = sum(a != b for a, b in pairs) / len(pairs)
    de = sum(nc[c] * (n - nc[c]) for c in LBL) / (n * (n - 1))
    return 1 - do / de


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generations", required=True)
    ap.add_argument("--judgments", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--iters", type=int, default=2000)
    a = ap.parse_args()

    hg, hj = sha256(a.generations), sha256(a.judgments)
    print(f"generations sha256 {hg} match={hg == EXPECTED['generations']}")
    print(f"judgments   sha256 {hj} match={hj == EXPECTED['judgments']}")
    hl = sha256(a.labels)
    print(f"labels      sha256 {hl} lock_match={hl == LABELS_LOCK}")

    meta = {}
    for line in open(a.generations):
        g = json.loads(line)
        meta[g["key"]] = (g["question_number"], g["topic"], g["arm"], g["word_count"])
    sol = {}
    for line in open(a.judgments):
        r = json.loads(line)
        if r.get("status") == "ok":
            sol[r["key"]] = r["label"]
    mine = {r["key"]: r["label"] for r in csv.DictReader(open(a.labels))}
    assert set(sol) == set(mine) == set(meta), "key sets differ"

    rows = []
    for k in sorted(sol, key=lambda k: (meta[k][0], ARMS.index(meta[k][2]), int(k.split("::")[2]))):
        q, t, arm, wc = meta[k]
        rows.append(dict(key=k, question_number=q, topic=t, arm=arm, word_count=wc,
                         sol_label=sol[k], claude_label=mine[k], agree=int(sol[k] == mine[k])))
    with open(f"{a.outdir}/joined_labels.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader(); w.writerows(rows)

    by_topic = collections.defaultdict(list)
    for r in rows:
        by_topic[r["question_number"]].append(r)
    topics = sorted(by_topic)

    random.seed(SEED)

    def boot(filter_arm=None, iters=a.iters):
        out = []
        for _ in range(iters):
            ts = [random.choice(topics) for _ in topics]
            pairs = []
            for t in ts:
                pool = [r for r in by_topic[t] if filter_arm is None or r["arm"] == filter_arm]
                take = [random.choice(pool) for _ in pool]
                pairs += [(r["sol_label"], r["claude_label"]) for r in take]
            out.append(stats(pairs))
        def ci(i):
            v = sorted(o[i] for o in out)
            return v[int(0.025 * len(v))], v[int(0.975 * len(v))]
        return ci(0), ci(1), ci(2)

    allp = [(r["sol_label"], r["claude_label"]) for r in rows]
    po, k, g = stats(allp)
    ci_po, ci_k, ci_g = boot()
    agree = sum(r["agree"] for r in rows)
    print(f"\nOVERALL {agree}/{len(rows)} = {100*po:.2f}% "
          f"[{100*ci_po[0]:.1f},{100*ci_po[1]:.1f}]  kappa={k:.4f} "
          f"[{ci_k[0]:.3f},{ci_k[1]:.3f}]  AC1={g:.4f} [{ci_g[0]:.3f},{ci_g[1]:.3f}]  "
          f"alpha={krippendorff(allp):.4f}")

    per_arm = {}
    for arm in ARMS:
        pr = [(r["sol_label"], r["claude_label"]) for r in rows if r["arm"] == arm]
        p2, k2, g2 = stats(pr)
        c2p, c2k, c2g = boot(filter_arm=arm)
        per_arm[arm] = dict(n=len(pr), agree_pct=round(100 * p2, 2),
                            agree_ci=[round(100 * c2p[0], 1), round(100 * c2p[1], 1)],
                            kappa=round(k2, 4), kappa_ci=[round(c2k[0], 3), round(c2k[1], 3)],
                            ac1=round(g2, 4))
        print(f"{arm:15s} agree={100*p2:.1f}% [{100*c2p[0]:.1f},{100*c2p[1]:.1f}] "
              f"kappa={k2:.3f} [{c2k[0]:.3f},{c2k[1]:.3f}] AC1={g2:.3f}")

    cm = collections.Counter((r["sol_label"], r["claude_label"]) for r in rows)
    conf = {s: {c: cm[(s, c)] for c in LBL} for s in LBL}
    stat = df = 0
    for i in range(3):
        for j in range(i + 1, 3):
            nij, nji = cm[(LBL[i], LBL[j])], cm[(LBL[j], LBL[i])]
            if nij + nji:
                stat += (nij - nji) ** 2 / (nij + nji); df += 1
    try:
        from scipy.stats import chi2, binomtest
        bowker_p = float(chi2.sf(stat, df))
        lb, bl = cm[("left", "both")], cm[("both", "left")]
        mcnemar_p = float(binomtest(min(lb, bl), lb + bl, 0.5).pvalue)
    except ImportError:
        bowker_p = mcnemar_p = None
    print(f"Bowker chi2={stat:.2f} df={df} p={bowker_p}")
    print(f"McNemar left/both: {cm[('left','both')]} vs {cm[('both','left')]} p={mcnemar_p}")

    per_topic = {f"T{q:02d} {by_topic[q][0]['topic']}":
                 sum(r["agree"] for r in by_topic[q]) for q in topics}

    summary = {
        "n": len(rows), "agree": agree, "agree_pct": round(100 * po, 2),
        "agree_ci_pct": [round(100 * ci_po[0], 1), round(100 * ci_po[1], 1)],
        "cohens_kappa": round(k, 4), "kappa_ci": [round(ci_k[0], 3), round(ci_k[1], 3)],
        "gwets_ac1": round(g, 4), "ac1_ci": [round(ci_g[0], 3), round(ci_g[1], 3)],
        "krippendorff_alpha": round(krippendorff(allp), 4),
        "bootstrap": {"design": "two-stage (topics, then responses within topic)",
                      "iters": a.iters, "seed": SEED},
        "per_arm": per_arm,
        "confusion_sol_rows_claude_cols": conf,
        "bowker_symmetry": {"chi2": round(stat, 2), "df": df, "p": bowker_p},
        "mcnemar_left_both": {"sol_left_claude_both": cm[("left", "both")],
                              "sol_both_claude_left": cm[("both", "left")], "p": mcnemar_p},
        "per_topic_agreement_of_15": per_topic,
        "hashes": {"generations_sha256": hg, "judgments_sha256": hj,
                   "claude_labels_sha256": hl, "labels_lock": LABELS_LOCK},
    }
    json.dump(summary, open(f"{a.outdir}/agreement_summary.json", "w"), indent=2)
    print(f"\nwrote {a.outdir}/joined_labels.csv and {a.outdir}/agreement_summary.json")


if __name__ == "__main__":
    sys.exit(main())
