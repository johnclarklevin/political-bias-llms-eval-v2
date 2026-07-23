#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const RAW = path.join(ROOT, "data", "raw");
const RESULTS = path.join(ROOT, "results");
const INPUTS_PATH = path.join(ROOT, "inputs.json");
const EXPECTED = 1_520;
const T95_DF18 = 2.10092204024096;
const T90_DF18 = 1.73406360661754;
const EQUIVALENCE_MARGIN = 0.10;

async function readJsonl(file) {
  return (await readFile(file, "utf8")).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

function latestSuccessfulByKey(rows) {
  const output = new Map();
  for (const row of rows) if (row.status === "ok") output.set(row.key, row);
  return output;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function sampleSd(values) {
  if (values.length < 2) return 0;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
}

function interval(values, critical = T95_DF18) {
  if (values.length !== 19) throw new Error(`Expected 19 topic values; found ${values.length}`);
  const estimate = mean(values);
  const sd = sampleSd(values);
  const se = sd / Math.sqrt(values.length);
  return {
    estimate,
    sd,
    se,
    lower: estimate - critical * se,
    upper: estimate + critical * se,
  };
}

function exactSignFlipP(values) {
  if (values.length > 25) throw new Error("Exact sign-flip enumeration is limited to 25 values.");
  const observed = Math.abs(mean(values));
  let asExtreme = 0;
  const assignments = 2 ** values.length;
  for (let mask = 0; mask < assignments; mask += 1) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
      sum += (mask & (1 << index) ? 1 : -1) * values[index];
    }
    if (Math.abs(sum / values.length) >= observed - 1e-12) asExtreme += 1;
  }
  return asExtreme / assignments;
}

function holmAdjust(rows, pField = "p_value", outputField = "holm_p_value") {
  const ranked = [...rows].sort((a, b) => a[pField] - b[pField]);
  let prior = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    const adjusted = Math.min(1, (ranked.length - index) * ranked[index][pField]);
    prior = Math.max(prior, adjusted);
    ranked[index][outputField] = prior;
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns = Object.keys(rows[0] ?? {})) {
  if (!rows.length) return "";
  return `${columns.join(",")}\n${rows.map((row) =>
    columns.map((column) => csvEscape(row[column])).join(",")).join("\n")}\n`;
}

function formatPct(value, digits = 1) {
  return `${(100 * value).toFixed(digits)}%`;
}

function formatP(value) {
  if (value < 0.001) return "<.001";
  return value.toFixed(3).replace(/^0/u, "");
}

function formatPInline(value) {
  return value < 0.001 ? "p<.001" : `p=${formatP(value)}`;
}

function titleCaseArm(armId, armById) {
  return armById.get(armId)?.short_label ?? armId;
}

const inputs = JSON.parse(await readFile(INPUTS_PATH, "utf8"));
const manifest = JSON.parse(await readFile(path.join(RAW, "manifest.json"), "utf8"));
const generationRecords = await readJsonl(path.join(RAW, "generations.jsonl"));
const primaryRecords = await readJsonl(path.join(RAW, "primary-judgments.jsonl"));
const fourRecords = await readJsonl(path.join(RAW, "four-label-judgments.jsonl"));
const generations = latestSuccessfulByKey(generationRecords);
const primaryByKey = latestSuccessfulByKey(primaryRecords);
const four = latestSuccessfulByKey(fourRecords);

const rows = [];
for (const [key, generation] of generations) {
  const primaryJudgment = primaryByKey.get(key);
  const fourJudgment = four.get(key);
  if (!primaryJudgment || primaryJudgment.generation_response_id !== generation.response_id) continue;
  if (!fourJudgment || fourJudgment.generation_response_id !== generation.response_id) continue;
  rows.push({
    ...generation,
    primary_label: primaryJudgment.label,
    primary_left: Number(primaryJudgment.label === "left"),
    primary_judge_response_id: primaryJudgment.response_id,
    primary_judge_actual_model: primaryJudgment.actual_model,
    four_label: fourJudgment.label,
    four_left: Number(fourJudgment.label === "left"),
    four_judge_response_id: fourJudgment.response_id,
    four_judge_actual_model: fourJudgment.actual_model,
  });
}

if (rows.length !== EXPECTED) {
  throw new Error(`Expected ${EXPECTED} fully judged responses; found ${rows.length}.`);
}

const armById = new Map(inputs.arms.map((arm) => [arm.id, arm]));
const topicNumbers = inputs.topic_question_numbers;
const expectedKeys = new Set(inputs.topics.flatMap((topic) =>
  inputs.backgrounds.flatMap((background) =>
    inputs.arms.map((arm) => `${topic.original_question_number}::${background.id}::${arm.id}`))));
if (expectedKeys.size !== EXPECTED || rows.some((row) => !expectedKeys.has(row.key))) {
  throw new Error("Observed keys do not match the pre-specified design.");
}
const observedKeys = new Set(rows.map((row) => row.key));
if (observedKeys.size !== EXPECTED) throw new Error("Duplicate or missing successful design keys.");

const cells = new Map();
for (const row of rows) {
  const key = `${row.original_question_number}::${row.background_id}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(row);
}
if (cells.size !== 19 * 16 || [...cells.values()].some((cell) =>
  cell.length !== 5 || new Set(cell.map((row) => row.arm_id)).size !== 5)) {
  throw new Error("The topic × background blocks are not balanced across all five arms.");
}

const topicArm = new Map();
for (const questionNumber of topicNumbers) {
  const topicRows = rows.filter((row) => row.original_question_number === questionNumber);
  for (const arm of inputs.arms) {
    const selected = topicRows.filter((row) => row.arm_id === arm.id);
    if (selected.length !== 16) {
      throw new Error(`Expected 16 rows for topic ${questionNumber}, arm ${arm.id}; found ${selected.length}.`);
    }
    topicArm.set(`${questionNumber}::${arm.id}`, {
      primary_left: mean(selected.map((row) => row.primary_left)),
      four_left: mean(selected.map((row) => row.four_left)),
      word_count: mean(selected.map((row) => row.word_count)),
      strict_heading_marker: mean(selected.map((row) => Number(row.strict_heading_marker))),
    });
  }
}

const topicNameByNumber = new Map(inputs.topics.map((topic) => [topic.original_question_number, topic.topic]));
const topicArmRows = [];
for (const questionNumber of topicNumbers) {
  for (const arm of inputs.arms) {
    topicArmRows.push({
      original_question_number: questionNumber,
      topic: topicNameByNumber.get(questionNumber),
      arm_id: arm.id,
      arm_label: arm.short_label,
      n: 16,
      ...topicArm.get(`${questionNumber}::${arm.id}`),
    });
  }
}

function armValues(armId, outcome) {
  return topicNumbers.map((number) => topicArm.get(`${number}::${armId}`)[outcome]);
}

function contrastValues(weights, outcome) {
  return topicNumbers.map((number) => [...weights].reduce((sum, [armId, weight]) =>
    sum + weight * topicArm.get(`${number}::${armId}`)[outcome], 0));
}

function describeContrast({
  id, label, leftArm, rightArm, weights, outcome, includeP = true,
}) {
  const values = contrastValues(weights, outcome);
  const ci95 = interval(values, T95_DF18);
  const ci90 = interval(values, T90_DF18);
  return {
    contrast_id: id,
    contrast: label,
    left_arm: leftArm,
    right_arm: rightArm,
    topics: values.length,
    estimate: ci95.estimate,
    estimate_pp: 100 * ci95.estimate,
    topic_sd: ci95.sd,
    standard_error: ci95.se,
    ci95_lower: ci95.lower,
    ci95_upper: ci95.upper,
    ci95_lower_pp: 100 * ci95.lower,
    ci95_upper_pp: 100 * ci95.upper,
    ci90_lower: ci90.lower,
    ci90_upper: ci90.upper,
    ci90_lower_pp: 100 * ci90.lower,
    ci90_upper_pp: 100 * ci90.upper,
    p_value: includeP ? exactSignFlipP(values) : null,
    topic_effect_min: Math.min(...values),
    topic_effect_max: Math.max(...values),
  };
}

function describeNumericValues({ id, label, leftArm, rightArm, values, unit }) {
  const ci95 = interval(values, T95_DF18);
  const ci90 = interval(values, T90_DF18);
  return {
    contrast_id: id,
    contrast: label,
    left_arm: leftArm,
    right_arm: rightArm,
    unit,
    topics: values.length,
    estimate: ci95.estimate,
    topic_sd: ci95.sd,
    standard_error: ci95.se,
    ci95_lower: ci95.lower,
    ci95_upper: ci95.upper,
    ci90_lower: ci90.lower,
    ci90_upper: ci90.upper,
    p_value: exactSignFlipP(values),
    topic_effect_min: Math.min(...values),
    topic_effect_max: Math.max(...values),
  };
}

const outcomes = [
  { id: "primary", field: "primary_left", label: "Three-label primary judge" },
  { id: "four_label", field: "four_left", label: "Four-label robustness judge" },
];
const armSummaries = [];
const contrasts = {};

for (const outcome of outcomes) {
  for (const arm of inputs.arms) {
    const values = armValues(arm.id, outcome.field);
    const ci = interval(values);
    const selected = rows.filter((row) => row.arm_id === arm.id);
    const labelField = outcome.id === "primary" ? "primary_label" : "four_label";
    const labelNames = outcome.id === "primary"
      ? ["left", "both", "right"]
      : ["left", "both", "right", "none"];
    const counts = Object.fromEntries(labelNames.map((label) =>
      [label, selected.filter((row) => row[labelField] === label).length]));
    armSummaries.push({
      outcome: outcome.id,
      outcome_label: outcome.label,
      arm_id: arm.id,
      arm_label: arm.short_label,
      sentence: arm.text,
      topics: 19,
      n: selected.length,
      left_n: counts.left,
      left_frequency: counts.left / selected.length,
      both_n: counts.both,
      both_frequency: counts.both / selected.length,
      right_n: counts.right,
      right_frequency: counts.right / selected.length,
      none_n: counts.none ?? null,
      none_frequency: counts.none === undefined ? null : counts.none / selected.length,
      topic_mean_left_frequency: ci.estimate,
      ci95_lower: ci.lower,
      ci95_upper: ci.upper,
      average_word_count: mean(selected.map((row) => row.word_count)),
      strict_heading_marker_frequency: mean(selected.map((row) => Number(row.strict_heading_marker))),
    });
  }

  const familyControl = ["essay", "output", "response", "heading"].map((armId) =>
    describeContrast({
      id: `${armId}_vs_control`,
      label: `${titleCaseArm(armId, armById)} − no sentence 5`,
      leftArm: armId,
      rightArm: "control",
      weights: new Map([[armId, 1], ["control", -1]]),
      outcome: outcome.field,
    }));
  holmAdjust(familyControl);

  const familyAlternatives = ["output", "response", "heading"].map((armId) =>
    describeContrast({
      id: `essay_vs_${armId}`,
      label: `Essay − ${titleCaseArm(armId, armById).toLowerCase()}`,
      leftArm: "essay",
      rightArm: armId,
      weights: new Map([["essay", 1], [armId, -1]]),
      outcome: outcome.field,
    }));
  holmAdjust(familyAlternatives);

  const primaryContrast = describeContrast({
    id: "essay_vs_alternative_mean",
    label: "Essay − mean(output, response, heading)",
    leftArm: "essay",
    rightArm: "alternative_mean",
    weights: new Map([
      ["essay", 1],
      ["output", -1 / 3],
      ["response", -1 / 3],
      ["heading", -1 / 3],
    ]),
    outcome: outcome.field,
  });
  primaryContrast.equivalence_margin = EQUIVALENCE_MARGIN;
  primaryContrast.equivalence_margin_pp = 100 * EQUIVALENCE_MARGIN;
  primaryContrast.equivalent_within_margin =
    primaryContrast.ci90_lower > -EQUIVALENCE_MARGIN
    && primaryContrast.ci90_upper < EQUIVALENCE_MARGIN;

  contrasts[outcome.id] = {
    primary: primaryContrast,
    versus_control: familyControl,
    essay_versus_alternatives: familyAlternatives,
  };
}

const alternativeWeights = new Map([
  ["essay", 1], ["output", -1 / 3], ["response", -1 / 3], ["heading", -1 / 3],
]);
const wordContrasts = [
  describeNumericValues({
    id: "essay_vs_alternative_mean",
    label: "Essay − mean(output, response, heading)",
    leftArm: "essay",
    rightArm: "alternative_mean",
    values: contrastValues(alternativeWeights, "word_count"),
    unit: "words",
  }),
  ...["essay", "output", "response", "heading"].map((armId) =>
    describeNumericValues({
      id: `${armId}_vs_control`,
      label: `${titleCaseArm(armId, armById)} − no sentence 5`,
      leftArm: armId,
      rightArm: "control",
      values: contrastValues(new Map([[armId, 1], ["control", -1]]), "word_count"),
      unit: "words",
    })),
];
holmAdjust(wordContrasts.slice(1));

function filteredContrastValues(weights, outcome, wordLimitPresent) {
  return topicNumbers.map((number) => [...weights].reduce((sum, [armId, weight]) => {
    const selected = rows.filter((row) =>
      row.original_question_number === number
      && row.arm_id === armId
      && Boolean(row.background_included[0]) === wordLimitPresent);
    if (selected.length !== 8) {
      throw new Error(`Expected 8 filtered rows for topic ${number}, arm ${armId}; found ${selected.length}.`);
    }
    return sum + weight * mean(selected.map((row) => row[outcome]));
  }, 0));
}

const wordLimitModeration = [];
for (const outcome of [
  { id: "primary", field: "primary_left", unit: "proportion" },
  { id: "four_label", field: "four_left", unit: "proportion" },
  { id: "word_count", field: "word_count", unit: "words" },
]) {
  const absentValues = filteredContrastValues(alternativeWeights, outcome.field, false);
  const presentValues = filteredContrastValues(alternativeWeights, outcome.field, true);
  const interactionValues = presentValues.map((value, index) => value - absentValues[index]);
  for (const [level, values] of [
    ["absent", absentValues],
    ["present", presentValues],
    ["present_minus_absent", interactionValues],
  ]) {
    const described = describeNumericValues({
      id: `essay_vs_alternative_mean__word_limit_${level}`,
      label: level === "present_minus_absent"
        ? "Word-limit moderation of essay − alternative mean"
        : `Essay − alternative mean; 30-word cap ${level}`,
      leftArm: "essay",
      rightArm: "alternative_mean",
      values,
      unit: outcome.unit,
    });
    wordLimitModeration.push({
      analysis: outcome.id,
      word_limit: level,
      ...described,
      estimate_pp: outcome.unit === "proportion" ? 100 * described.estimate : null,
      ci95_lower_pp: outcome.unit === "proportion" ? 100 * described.ci95_lower : null,
      ci95_upper_pp: outcome.unit === "proportion" ? 100 * described.ci95_upper : null,
    });
  }
}

const headingSummaries = inputs.arms.map((arm) => {
  const selected = rows.filter((row) => row.arm_id === arm.id);
  return {
    arm_id: arm.id,
    arm_label: arm.short_label,
    n: selected.length,
    strict_heading_markers: selected.filter((row) => row.strict_heading_marker).length,
    strict_heading_marker_frequency: mean(selected.map((row) => Number(row.strict_heading_marker))),
    average_word_count: mean(selected.map((row) => row.word_count)),
    median_word_count: [...selected.map((row) => row.word_count)].sort((a, b) => a - b)[Math.floor(selected.length / 2)],
  };
});

const primaryContrast = contrasts.primary.primary;
const controlEffects = new Map(contrasts.primary.versus_control.map((row) =>
  [row.left_arm, row]));
const alternativeEffects = ["output", "response", "heading"].map((armId) =>
  controlEffects.get(armId).estimate);
let conclusionCode;
if (primaryContrast.p_value < 0.05 && primaryContrast.estimate > EQUIVALENCE_MARGIN) {
  conclusionCode = "essay_specific_positive";
} else if (primaryContrast.p_value < 0.05 && primaryContrast.estimate < -EQUIVALENCE_MARGIN) {
  conclusionCode = "alternatives_stronger";
} else if (primaryContrast.equivalent_within_margin
    && alternativeEffects.every((effect) => effect > 0)) {
  conclusionCode = "not_essay_specific";
} else {
  conclusionCode = "inconclusive";
}

const summary = {
  generated_at: new Date().toISOString(),
  design: {
    topics: 19,
    backgrounds: 16,
    arms: 5,
    responses: rows.length,
    generation_model_requested: manifest.generation_model,
    generation_model_snapshots: [...new Set(rows.map((row) => row.actual_model))],
    judge_model_requested: manifest.judge_model,
    primary_judge_snapshots: [...new Set(rows.map((row) => row.primary_judge_actual_model))],
    four_label_judge_snapshots: [...new Set(rows.map((row) => row.four_judge_actual_model))],
    task_order_seed: manifest.task_order_seed,
  },
  equivalence_margin_pp: 10,
  conclusion_code: conclusionCode,
  contrasts,
  arm_summaries: armSummaries,
  word_count_contrasts: wordContrasts,
  exploratory_word_limit_moderation: wordLimitModeration,
  heading_summaries: headingSummaries,
  judge_disagreements: rows.filter((row) => row.primary_label !== row.four_label).length,
};

function reportConclusion(code) {
  if (code === "essay_specific_positive") {
    return "The original “essay” wording produced a reliably larger left-only effect than all three alternatives, supporting an essay-specific wording mechanism in this design.";
  }
  if (code === "alternatives_stronger") {
    return "The alternatives produced a meaningfully larger left-only effect than the original “essay” wording; “essay” does not explain the earlier main effect.";
  }
  if (code === "not_essay_specific") {
    return "The original and alternative phrasings were practically equivalent within the pre-specified ±10-point margin, and the alternatives also increased left-only frequency versus control. The data do not support “essay” as the responsible ingredient.";
  }
  return "The focused experiment is inconclusive about an essay-specific mechanism: the data neither show a reliable essay-versus-alternatives difference nor establish equivalence within the pre-specified ±10-point margin.";
}

function contrastTable(family) {
  return [
    "| Contrast | Effect (pp) | 95% CI (pp) | Exact p | Holm p |",
    "|---|---:|---:|---:|---:|",
    ...family.map((row) =>
      `| ${row.contrast} | ${row.estimate_pp.toFixed(1)} | ${row.ci95_lower_pp.toFixed(1)} to ${row.ci95_upper_pp.toFixed(1)} | ${formatP(row.p_value)} | ${formatP(row.holm_p_value)} |`),
  ].join("\n");
}

function armTable(outcomeId) {
  const selected = armSummaries.filter((row) => row.outcome === outcomeId);
  return [
    "| Arm | Left-only | 95% topic interval | Both | Right | None | Mean words |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...selected.map((row) =>
      `| ${row.arm_label} | ${formatPct(row.left_frequency)} | ${formatPct(row.ci95_lower)} to ${formatPct(row.ci95_upper)} | ${formatPct(row.both_frequency)} | ${formatPct(row.right_frequency)} | ${row.none_frequency === null ? "—" : formatPct(row.none_frequency)} | ${row.average_word_count.toFixed(1)} |`),
  ].join("\n");
}

const primaryResult = contrasts.primary.primary;
const robust = contrasts.four_label.primary;
const wordEssayAlternative = wordContrasts.find((row) => row.contrast_id === "essay_vs_alternative_mean");
const wordEssayControl = wordContrasts.find((row) => row.contrast_id === "essay_vs_control");
const moderation = (analysis, level) => wordLimitModeration.find((row) =>
  row.analysis === analysis && row.word_limit === level);
const report = `# Focused GPT-5.5 sentence-5 replication

## Bottom line

${reportConclusion(conclusionCode)}

![Left-only frequency by wording](charts/arm-left-only-rates.svg)

![Effects versus no sentence 5](charts/effects-vs-control.svg)

The pre-specified primary contrast—essay minus the mean of output, response,
and heading—was **${primaryResult.estimate_pp.toFixed(1)} percentage points**
(95% topic-level CI ${primaryResult.ci95_lower_pp.toFixed(1)} to
${primaryResult.ci95_upper_pp.toFixed(1)}; exact sign-flip
${formatPInline(primaryResult.p_value)}). Its 90% interval was
${primaryResult.ci90_lower_pp.toFixed(1)} to ${primaryResult.ci90_upper_pp.toFixed(1)}
points, so the ±10-point equivalence test
**${primaryResult.equivalent_within_margin ? "passed" : "did not pass"}**.

Under the four-label robustness judge, the same contrast was
${robust.estimate_pp.toFixed(1)} points (95% CI
${robust.ci95_lower_pp.toFixed(1)} to ${robust.ci95_upper_pp.toFixed(1)};
exact ${formatPInline(robust.p_value)}); equivalence
${robust.equivalent_within_margin ? "passed" : "did not pass"}.

The essay arm also produced substantially longer responses: +${wordEssayControl.estimate.toFixed(1)}
words versus control and +${wordEssayAlternative.estimate.toFixed(1)} words versus the
three-alternative mean. This makes essay-induced response length a plausible
part of the mechanism, although the focused experiment does not identify a
formal causal mediation effect.

## Design

The experiment crossed all five arms with all 16 combinations of the first
four Washington Post system-prompt sentences and all 19 topics in the current
No Fringe pool. One independent GPT-5.5 response was generated in every
topic × background × arm cell (1,520 total). The candidate sentence always
appeared last, and API task order was randomized with seed
\`${manifest.task_order_seed}\`.

The no-sentence arm identifies whether each alternative reproduces the earlier
sentence-5 main effect. The complete 16-background crossing matches the
marginal estimand from the supplied \(2^5\) factorial ablation instead of
conditioning on only the full prompt.

## Primary three-label results

${armTable("primary")}

### Each wording versus no sentence 5

${contrastTable(contrasts.primary.versus_control)}

### Original wording versus each alternative

${contrastTable(contrasts.primary.essay_versus_alternatives)}

## Four-label judge robustness

${armTable("four_label")}

### Each wording versus no sentence 5

${contrastTable(contrasts.four_label.versus_control)}

### Original wording versus each alternative

${contrastTable(contrasts.four_label.essay_versus_alternatives)}

The two judges disagreed on ${summary.judge_disagreements} of ${rows.length}
responses (${formatPct(summary.judge_disagreements / rows.length)}).

## Formatting and length

| Arm | Mean words | Median words | Strict heading marker |
|---|---:|---:|---:|
${headingSummaries.map((row) =>
  `| ${row.arm_label} | ${row.average_word_count.toFixed(1)} | ${row.median_word_count} | ${formatPct(row.strict_heading_marker_frequency)} |`).join("\n")}

The heading detector is intentionally strict: it recognizes leading Markdown
headings, setext headings, and standalone bold first lines. It is descriptive
and will miss plain-text titles.

## Exploratory moderation by the 30-word cap

This analysis was not part of the pre-specified confirmatory test. It asks
whether the essay-versus-alternatives contrast changes when sentence 1 forces
all arms to be short.

| Outcome | 30-word cap | Essay − alternative mean | 95% CI | Exact p |
|---|---|---:|---:|---:|
| Primary left-only | Absent | ${moderation("primary", "absent").estimate_pp.toFixed(1)} pp | ${moderation("primary", "absent").ci95_lower_pp.toFixed(1)} to ${moderation("primary", "absent").ci95_upper_pp.toFixed(1)} | ${formatP(moderation("primary", "absent").p_value)} |
| Primary left-only | Present | ${moderation("primary", "present").estimate_pp.toFixed(1)} pp | ${moderation("primary", "present").ci95_lower_pp.toFixed(1)} to ${moderation("primary", "present").ci95_upper_pp.toFixed(1)} | ${formatP(moderation("primary", "present").p_value)} |
| Four-label left-only | Absent | ${moderation("four_label", "absent").estimate_pp.toFixed(1)} pp | ${moderation("four_label", "absent").ci95_lower_pp.toFixed(1)} to ${moderation("four_label", "absent").ci95_upper_pp.toFixed(1)} | ${formatP(moderation("four_label", "absent").p_value)} |
| Four-label left-only | Present | ${moderation("four_label", "present").estimate_pp.toFixed(1)} pp | ${moderation("four_label", "present").ci95_lower_pp.toFixed(1)} to ${moderation("four_label", "present").ci95_upper_pp.toFixed(1)} | ${formatP(moderation("four_label", "present").p_value)} |
| Word count | Absent | ${moderation("word_count", "absent").estimate.toFixed(1)} words | ${moderation("word_count", "absent").ci95_lower.toFixed(1)} to ${moderation("word_count", "absent").ci95_upper.toFixed(1)} | ${formatP(moderation("word_count", "absent").p_value)} |
| Word count | Present | ${moderation("word_count", "present").estimate.toFixed(1)} words | ${moderation("word_count", "present").ci95_lower.toFixed(1)} to ${moderation("word_count", "present").ci95_upper.toFixed(1)} | ${formatP(moderation("word_count", "present").p_value)} |

The cap reduced the primary essay-specific contrast by
${Math.abs(moderation("primary", "present_minus_absent").estimate_pp).toFixed(1)} points
(interaction 95% CI ${moderation("primary", "present_minus_absent").ci95_lower_pp.toFixed(1)}
to ${moderation("primary", "present_minus_absent").ci95_upper_pp.toFixed(1)};
${formatPInline(moderation("primary", "present_minus_absent").p_value)}) and reduced the
word-count contrast by ${Math.abs(moderation("word_count", "present_minus_absent").estimate).toFixed(1)}
words. Under the four-label judge, the moderation contrast was
${moderation("four_label", "present_minus_absent").estimate_pp.toFixed(1)} points
(95% CI ${moderation("four_label", "present_minus_absent").ci95_lower_pp.toFixed(1)}
to ${moderation("four_label", "present_minus_absent").ci95_upper_pp.toFixed(1)};
${formatPInline(moderation("four_label", "present_minus_absent").p_value)}).
That pattern is consistent with response length carrying part of the
essay-wording effect, but the remaining capped contrast and the exploratory
status argue against treating this as definitive mediation evidence.

## Statistical notes

Effects were computed within topic after averaging across all 16 background
prompts. Intervals are t intervals over 19 topic-level effects; exact
two-sided sign-flip tests enumerate all \(2^{19}=524{,}288\) topic sign
assignments. Holm adjustment is applied separately to the four
wording-versus-control tests and the three essay-versus-alternative tests.

The pre-specified practical-equivalence margin was ±10 percentage points. A
non-significant difference alone was not interpreted as equivalence.
The four-label analysis was pre-specified because the supplied ablation showed
substantial judge-specification sensitivity.

## Scope and limitations

The estimates apply to the fixed 19-topic No Fringe pool, the complete set of
16 sentence-1–4 backgrounds, and the recorded model snapshots. There is one
generation per exact cell, so repeated-run stochastic stability is not directly
estimated. Topic-level inference is conservative for the many independent API
responses but should not be read as population inference beyond this audited
topic pool.

“Left-only” is a model-judge classification, not a direct measurement of
ideology, policy intensity, accuracy, or equal emphasis. Differences among
these sentences can reflect literal wording, formatting behavior, response
length, or broader instruction-following modes.
`;

await mkdir(RESULTS, { recursive: true });
await Promise.all([
  writeFile(path.join(RESULTS, "responses.csv"), toCsv(rows.map((row) => ({
    key: row.key,
    original_question_number: row.original_question_number,
    topic: row.topic,
    background_id: row.background_id,
    background_code: row.background_code,
    arm_id: row.arm_id,
    arm_label: row.arm_label,
    sentence5: row.sentence5,
    system_prompt: row.system_prompt,
    requested_model: row.requested_model,
    actual_model: row.actual_model,
    response_id: row.response_id,
    response: row.response,
    word_count: row.word_count,
    strict_heading_marker: row.strict_heading_marker,
    word_limit_compliant: row.word_limit_compliant,
    primary_label: row.primary_label,
    primary_judge_actual_model: row.primary_judge_actual_model,
    primary_judge_response_id: row.primary_judge_response_id,
    four_label: row.four_label,
    four_judge_actual_model: row.four_judge_actual_model,
    four_judge_response_id: row.four_judge_response_id,
    created_at: row.created_at,
  }))), "utf8"),
  writeFile(path.join(RESULTS, "arm-summary.csv"), toCsv(armSummaries), "utf8"),
  writeFile(path.join(RESULTS, "topic-arm-summary.csv"), toCsv(topicArmRows), "utf8"),
  writeFile(path.join(RESULTS, "primary-contrasts.csv"), toCsv([
    contrasts.primary.primary,
    ...contrasts.primary.versus_control,
    ...contrasts.primary.essay_versus_alternatives,
  ]), "utf8"),
  writeFile(path.join(RESULTS, "four-label-contrasts.csv"), toCsv([
    contrasts.four_label.primary,
    ...contrasts.four_label.versus_control,
    ...contrasts.four_label.essay_versus_alternatives,
  ]), "utf8"),
  writeFile(path.join(RESULTS, "word-count-contrasts.csv"), toCsv(wordContrasts), "utf8"),
  writeFile(path.join(RESULTS, "exploratory-word-limit-moderation.csv"), toCsv(wordLimitModeration), "utf8"),
  writeFile(path.join(RESULTS, "formatting-summary.csv"), toCsv(headingSummaries), "utf8"),
  writeFile(path.join(RESULTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
  writeFile(path.join(ROOT, "report.md"), report, "utf8"),
]);

console.log(JSON.stringify({
  responses: rows.length,
  conclusion_code: conclusionCode,
  primary_contrast_pp: primaryResult.estimate_pp,
  primary_ci95_pp: [primaryResult.ci95_lower_pp, primaryResult.ci95_upper_pp],
  primary_exact_p: primaryResult.p_value,
  primary_equivalent: primaryResult.equivalent_within_margin,
  four_label_contrast_pp: robust.estimate_pp,
  four_label_ci95_pp: [robust.ci95_lower_pp, robust.ci95_upper_pp],
  outputs: RESULTS,
}, null, 2));
