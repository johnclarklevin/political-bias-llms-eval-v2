#!/usr/bin/env python3
"""Inter-rater reliability: Claude Fable 5 (blinded re-score) vs GPT-5.6 Sol.

Arms:
  1. Leanings arm: 7-category holistic political-leaning labels (mapped to -3..+3).
  2. Skew arm: 0-10 endpoint-relative political-skew scores.

Metrics: exact/adjacent agreement, Cohen's kappa (unweighted, linear, quadratic),
Spearman/Pearson, Krippendorff's alpha (ordinal/interval), ICC(A,1), paired bias
tests, cluster (by-topic) bootstrap CIs for headline metrics.
"""
import csv, json, math, random
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import cohen_kappa_score, confusion_matrix
import krippendorff

random.seed(42); np.random.seed(42)

LEAN_ORDER = ['Far-left','Solidly left','Center-left','Centrist','Center-right','Solidly right','Far-right']
LEAN_NUM = {l: i-3 for i, l in enumerate(LEAN_ORDER)}  # -3..+3

# ---------- load ----------
mine = pd.read_csv('/home/claude/my_scores.csv')
sol_lean = pd.read_csv('/home/claude/repo/Appendix C - Valence Scores/gpt55-no-fringe-leanings/gpt55-no-fringe-overall-skew-scores.csv')
sol_skew = pd.read_csv('/home/claude/repo/Appendix C - Valence Scores/gpt55-no-fringe-skew/gpt55-no-fringe-political-skew-scores.csv')

sol_lean = sol_lean.rename(columns={'overall_skew':'sol_leaning','rationale':'sol_lean_rationale'})
sol_skew = sol_skew.rename(columns={'score':'sol_skew','rationale':'sol_skew_rationale'})

df = mine.merge(sol_lean[['source_key','sol_leaning','sol_lean_rationale']], on='source_key', validate='1:1')
df = df.merge(sol_skew[['source_key','sol_skew','sol_skew_rationale']], on='source_key', validate='1:1')
assert len(df) == 95, len(df)

# Normalize Sol's leaning labels to canonical set
canon = {l.lower(): l for l in LEAN_ORDER}
extra = {'far left':'Far-left','solid left':'Solidly left','left':'Solidly left','center left':'Center-left',
         'centre-left':'Center-left','centrist':'Centrist','center':'Centrist','center right':'Center-right',
         'centre-right':'Center-right','solid right':'Solidly right','right':'Solidly right','far right':'Far-right'}
def norm(lbl):
    s = str(lbl).strip().lower()
    if s in canon: return canon[s]
    if s in extra: return extra[s]
    raise ValueError(f'unmapped label: {lbl!r}')
df['sol_leaning'] = df['sol_leaning'].map(norm)
df['my_lean_n'] = df['my_leaning'].map(LEAN_NUM)
df['sol_lean_n'] = df['sol_leaning'].map(LEAN_NUM)

print('Sol leaning labels:', sorted(df.sol_leaning.unique()))
print('Sol skew range:', df.sol_skew.min(), '-', df.sol_skew.max())

# ---------- metric helpers ----------
def wkappa(a, b, labels, weights):
    return cohen_kappa_score(a, b, labels=labels, weights=weights)

def icc_a1(a, b):
    """ICC(A,1): two-way random effects, absolute agreement, single rater (McGraw & Wong ICC(2,1))."""
    Y = np.column_stack([a, b]).astype(float)
    n, k = Y.shape
    mean_t = Y.mean(axis=1); mean_r = Y.mean(axis=0); gm = Y.mean()
    SSR = k * ((mean_t - gm) ** 2).sum()            # rows (targets)
    SSC = n * ((mean_r - gm) ** 2).sum()            # columns (raters)
    SSE = ((Y - mean_t[:, None] - mean_r[None, :] + gm) ** 2).sum()
    MSR = SSR / (n - 1); MSC = SSC / (k - 1); MSE = SSE / ((n - 1) * (k - 1))
    return (MSR - MSE) / (MSR + (k - 1) * MSE + k * (MSC - MSE) / n)

def kripp(a, b, level):
    return krippendorff.alpha(reliability_data=np.vstack([a, b]).astype(float), level_of_measurement=level)

def summarize(name, a, b, labels, scale_desc):
    a = np.asarray(a); b = np.asarray(b)
    d = a - b
    out = {
        'arm': name, 'n': len(a), 'scale': scale_desc,
        'exact_agreement': float((a == b).mean()),
        'within_1': float((np.abs(d) <= 1).mean()),
        'within_2': float((np.abs(d) <= 2).mean()),
        'kappa_unweighted': wkappa(a, b, labels, None),
        'kappa_linear': wkappa(a, b, labels, 'linear'),
        'kappa_quadratic': wkappa(a, b, labels, 'quadratic'),
        'spearman_rho': stats.spearmanr(a, b).statistic,
        'pearson_r': stats.pearsonr(a, b).statistic,
        'krippendorff_ordinal': kripp(a, b, 'ordinal'),
        'krippendorff_interval': kripp(a, b, 'interval'),
        'icc_a1': icc_a1(a, b),
        'mean_claude': float(a.mean()), 'mean_sol': float(b.mean()),
        'mean_diff_claude_minus_sol': float(d.mean()),
        'sd_diff': float(d.std(ddof=1)),
        'mean_abs_diff': float(np.abs(d).mean()),
    }
    nz = d[d != 0]
    if len(nz) > 0:
        try:
            w = stats.wilcoxon(a, b, zero_method='wilcox')
            out['wilcoxon_p'] = float(w.pvalue)
        except Exception:
            out['wilcoxon_p'] = None
    else:
        out['wilcoxon_p'] = None
    out['t_paired_p'] = float(stats.ttest_rel(a, b).pvalue)
    return out

def cluster_bootstrap(df, acol, bcol, labels, n_boot=10000):
    """Bootstrap by topic cluster (19 topics, resample topics with replacement)."""
    topics = df['topic'].unique()
    stats_out = {'kappa_linear': [], 'kappa_quadratic': [], 'spearman': [], 'exact': [], 'mean_diff': []}
    grouped = {t: g for t, g in df.groupby('topic')}
    for _ in range(n_boot):
        pick = np.random.choice(topics, size=len(topics), replace=True)
        sub = pd.concat([grouped[t] for t in pick])
        a, b = sub[acol].to_numpy(), sub[bcol].to_numpy()
        if len(np.unique(np.concatenate([a, b]))) < 2:
            continue
        try:
            stats_out['kappa_linear'].append(wkappa(a, b, labels, 'linear'))
            stats_out['kappa_quadratic'].append(wkappa(a, b, labels, 'quadratic'))
            stats_out['spearman'].append(stats_spearman(a, b))
            stats_out['exact'].append(float((a == b).mean()))
            stats_out['mean_diff'].append(float((a - b).mean()))
        except Exception:
            continue
    return {k: (float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))) for k, v in stats_out.items() if v}

def stats_spearman(a, b):
    r = stats.spearmanr(a, b).statistic
    return float(r) if not math.isnan(r) else 0.0

# ---------- run ----------
lean_labels = list(range(-3, 4))
skew_labels = list(range(0, 11))

res_lean = summarize('leanings (7-cat, -3..+3)', df.my_lean_n, df.sol_lean_n, lean_labels, '7-category ordinal')
res_skew = summarize('skew (0-10)', df.my_skew, df.sol_skew, skew_labels, '11-point ordinal')

boot_lean = cluster_bootstrap(df, 'my_lean_n', 'sol_lean_n', lean_labels)
boot_skew = cluster_bootstrap(df, 'my_skew', 'sol_skew', skew_labels)

# Confusion matrices
cm_lean = pd.crosstab(df.my_leaning, df.sol_leaning).reindex(index=LEAN_ORDER, columns=LEAN_ORDER, fill_value=0)
cm_lean = cm_lean.loc[cm_lean.sum(1) > 0, cm_lean.sum(0) > 0]
cm_skew = pd.crosstab(df.my_skew, df.sol_skew)

# Disagreement analysis
df['lean_diff'] = df.my_lean_n - df.sol_lean_n
df['skew_diff'] = df.my_skew - df.sol_skew
big_lean = df[df.lean_diff.abs() >= 1][['source_key','topic','my_leaning','sol_leaning','lean_diff']]
big_skew = df[df.skew_diff.abs() >= 2][['source_key','topic','my_skew','sol_skew','skew_diff']]

topic_tbl = df.groupby('topic').agg(
    my_lean_mean=('my_lean_n','mean'), sol_lean_mean=('sol_lean_n','mean'),
    my_skew_mean=('my_skew','mean'), sol_skew_mean=('sol_skew','mean'),
    lean_exact=('lean_diff', lambda s: float((s==0).mean())),
    skew_exact=('skew_diff', lambda s: float((s==0).mean())),
    skew_within1=('skew_diff', lambda s: float((s.abs()<=1).mean())),
).round(2)

# ---------- output ----------
def fmt(r):
    keys = ['n','exact_agreement','within_1','within_2','kappa_unweighted','kappa_linear','kappa_quadratic',
            'spearman_rho','pearson_r','krippendorff_ordinal','krippendorff_interval','icc_a1',
            'mean_claude','mean_sol','mean_diff_claude_minus_sol','sd_diff','mean_abs_diff','wilcoxon_p','t_paired_p']
    return {k: (round(r[k], 4) if isinstance(r[k], float) else r[k]) for k in keys}

print('\n===== LEANINGS ARM ====='); print(json.dumps(fmt(res_lean), indent=1))
print('cluster-bootstrap 95% CIs:', json.dumps({k: [round(x,3) for x in v] for k, v in boot_lean.items()}))
print('\nConfusion (rows=Claude, cols=Sol):'); print(cm_lean.to_string())
print('\nMarginals — Claude:', dict(df.my_leaning.value_counts()), '| Sol:', dict(df.sol_leaning.value_counts()))

print('\n===== SKEW ARM ====='); print(json.dumps(fmt(res_skew), indent=1))
print('cluster-bootstrap 95% CIs:', json.dumps({k: [round(x,3) for x in v] for k, v in boot_skew.items()}))
print('\nConfusion (rows=Claude, cols=Sol):'); print(cm_skew.to_string())
print('\nSkew diff distribution (Claude - Sol):', dict(df.skew_diff.value_counts().sort_index()))

print('\n===== LEANING DISAGREEMENTS (|diff|>=1 band) =====')
print(big_lean.to_string(index=False) if len(big_lean) else '(none)')
print('\n===== SKEW DISAGREEMENTS (|diff|>=2 points) =====')
print(big_skew.to_string(index=False) if len(big_skew) else '(none)')
print('\n===== PER-TOPIC =====')
print(topic_tbl.to_string())

df.to_csv('/home/claude/merged_scores.csv', index=False)
json.dump({'leanings': fmt(res_lean), 'skew': fmt(res_skew),
           'boot_lean': boot_lean, 'boot_skew': boot_skew}, open('/home/claude/irr_results.json','w'), indent=1)
print('\nSaved merged_scores.csv and irr_results.json')
