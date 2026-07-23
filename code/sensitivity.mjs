#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const codeDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(codeDir, "..");
const labels = ["left", "both", "right"];
const includedSourceArms = new Set(["word_limit_30", "no_word_limit", "blank_system"]);
// Manually audited from the literal order of alternatives in each original
// prompt. Position was not randomized in the source design, so this analysis
// is descriptive and remains confounded with topic.
const firstEndpointLeft = new Set([1, 3, 4, 6, 7, 8, 9, 10, 11, 14, 17, 18, 20, 22, 25, 27, 28, 30]);

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    output[argument.slice(2)] = value;
    index += 1;
  }
  return output;
}

const options = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(options.run ?? path.join(repositoryRoot, "data", "raw"));
const outputDir = path.resolve(options.output ?? path.join(repositoryRoot, "data", "recomputed-sensitivity"));
const validationPath = path.resolve(options.validation ?? path.join(repositoryRoot, "data", "judge-validation", "summary.json"));
const assessmentPath = path.resolve(options.assessment ?? path.join(repositoryRoot, "data", "no-fringe-assessment.csv"));

const loadJsonl = async (file) => (await readFile(file, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
function parseCsv(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) records.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); records.push(row); }
  const headers = records.shift() ?? [];
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
const truthy = (value) => ["1", "true", "yes", "pass"].includes(String(value ?? "").trim().toLowerCase());
const assessmentRows = parseCsv(await readFile(assessmentPath, "utf8"));
const thresholdColumns = {
  threshold30: "passes_30_percent",
  threshold40: "passes_40_percent",
  threshold50: "passes_50_percent",
  threshold30_without_explicit_proxies: "passes_30_percent_without_explicit_proxies",
};
const thresholdSets = Object.fromEntries(Object.entries(thresholdColumns).map(([setName, column]) => {
  if (!assessmentRows.length || !(column in assessmentRows[0])) throw new Error(`Assessment file is missing ${column}: ${assessmentPath}`);
  return [setName, assessmentRows.filter((row) => truthy(row[column])).map((row) => Number(row.question_number)).sort((a, b) => a - b)];
}));
const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const toCsv = (rows, columns = Object.keys(rows[0] ?? {})) => [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
].join("\n") + "\n";
const round = (value, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const pct = (count, n) => 100 * count / n;
const quantile = (sorted, probability) => {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};
const mulberry32 = (seed) => () => {
  let value = seed += 0x6D2B79F5;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};

function successfulByKey(rows, kind) {
  const byKey = new Map();
  for (const row of rows.filter((candidate) => candidate.status === "ok")) {
    if (byKey.has(row.key)) throw new Error(`Duplicate successful ${kind} record for ${row.key}`);
    byKey.set(row.key, row);
  }
  return byKey;
}

const allGenerations = await loadJsonl(path.join(sourceDir, "generations.jsonl"));
const allJudgments = await loadJsonl(path.join(sourceDir, "judgments.jsonl"));
const generationByKey = successfulByKey(allGenerations, "generation");
const judgmentByKey = successfulByKey(allJudgments, "judgment");
const generations = [...generationByKey.values()];
const judgments = [...judgmentByKey.values()];
const missingJudgments = generations.filter((row) => includedSourceArms.has(row.arm) && !judgmentByKey.has(row.key)).map((row) => row.key);
const orphanJudgments = judgments.filter((row) => !generationByKey.has(row.key)).map((row) => row.key);
if (missingJudgments.length || orphanJudgments.length) {
  throw new Error(`Incomplete run: ${missingJudgments.length} included generation(s) lack judgments and ${orphanJudgments.length} judgment(s) lack generations.`);
}
const actualRows = generations.filter((generation) => includedSourceArms.has(generation.arm)).map((generation) => ({
  ...generation,
  label: judgmentByKey.get(generation.key)?.label,
  judge: judgmentByKey.get(generation.key),
}));

if (actualRows.length !== 450 || actualRows.some((row) => !labels.includes(row.label))) {
  throw new Error("Expected 450 successfully labeled source rows across the three included generation arms.");
}

const set30 = new Set(thresholdSets.threshold30);
const arms = {
  word_limit_30: actualRows.filter((row) => row.arm === "word_limit_30"),
  no_word_limit: actualRows.filter((row) => row.arm === "no_word_limit"),
  blank_system: actualRows.filter((row) => row.arm === "blank_system"),
  no_fringe_questions_30: actualRows.filter((row) => row.arm === "blank_system" && set30.has(row.question_number)),
};
const armNames = {
  word_limit_30: "Replication of WaPo",
  no_word_limit: "No Word Limit",
  blank_system: "No System Prompt",
  no_fringe_questions_30: "No Fringe Questions",
};

function summarize(rows) {
  const counts = Object.fromEntries(labels.map((label) => [label, rows.filter((row) => row.label === label).length]));
  return {
    topics: new Set(rows.map((row) => row.question_number)).size,
    n: rows.length,
    ...Object.fromEntries(labels.flatMap((label) => [
      [`${label}_n`, counts[label]],
      [`${label}_pct`, round(pct(counts[label], rows.length), 1)],
    ])),
    exclusive_net_left_pct: round(pct(counts.left - counts.right, rows.length), 1),
    any_left_pct: round(100 - pct(counts.right, rows.length), 1),
    any_right_pct: round(100 - pct(counts.left, rows.length), 1),
    mean_words: round(rows.reduce((sum, row) => sum + row.word_count, 0) / rows.length, 1),
  };
}

function wilson(count, n, z = 1.959963984540054) {
  const p = count / n;
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return [100 * (center - margin), 100 * (center + margin)];
}

function groupByTopic(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.question_number)) grouped.set(row.question_number, []);
    grouped.get(row.question_number).push(row);
  }
  return grouped;
}

function twoStageBootstrap(rows, iterations = 40000, seed = 20260722) {
  const random = mulberry32(seed);
  const topics = [...groupByTopic(rows).values()];
  const distributions = Object.fromEntries(labels.map((label) => [label, []]));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const counts = { left: 0, both: 0, right: 0 };
    let n = 0;
    for (let topicIndex = 0; topicIndex < topics.length; topicIndex += 1) {
      const sampledTopic = topics[Math.floor(random() * topics.length)];
      for (let responseIndex = 0; responseIndex < sampledTopic.length; responseIndex += 1) {
        const sampledResponse = sampledTopic[Math.floor(random() * sampledTopic.length)];
        counts[sampledResponse.label] += 1;
        n += 1;
      }
    }
    for (const label of labels) distributions[label].push(pct(counts[label], n));
  }
  return Object.fromEntries(labels.map((label) => {
    distributions[label].sort((a, b) => a - b);
    return [label, [quantile(distributions[label], 0.025), quantile(distributions[label], 0.975)]];
  }));
}

function pairedBootstrapDifference(rowsA, rowsB, iterations = 40000, seed = 20260723) {
  const random = mulberry32(seed);
  const byTopicA = groupByTopic(rowsA);
  const byTopicB = groupByTopic(rowsB);
  const common = [...byTopicA.keys()].filter((topic) => byTopicB.has(topic)).sort((a, b) => a - b);
  const distributions = Object.fromEntries(labels.map((label) => [label, []]));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const countsA = { left: 0, both: 0, right: 0 };
    const countsB = { left: 0, both: 0, right: 0 };
    let nA = 0;
    let nB = 0;
    for (let topicIndex = 0; topicIndex < common.length; topicIndex += 1) {
      const topic = common[Math.floor(random() * common.length)];
      const topicA = byTopicA.get(topic);
      const topicB = byTopicB.get(topic);
      for (let responseIndex = 0; responseIndex < topicA.length; responseIndex += 1) {
        const sample = topicA[Math.floor(random() * topicA.length)];
        countsA[sample.label] += 1;
        nA += 1;
      }
      for (let responseIndex = 0; responseIndex < topicB.length; responseIndex += 1) {
        const sample = topicB[Math.floor(random() * topicB.length)];
        countsB[sample.label] += 1;
        nB += 1;
      }
    }
    for (const label of labels) distributions[label].push(pct(countsB[label], nB) - pct(countsA[label], nA));
  }
  return Object.fromEntries(labels.map((label) => {
    distributions[label].sort((a, b) => a - b);
    return [label, [quantile(distributions[label], 0.025), quantile(distributions[label], 0.975)]];
  }));
}

const armSummaryRows = [];
for (const [arm, rows] of Object.entries(arms)) {
  const summary = summarize(rows);
  const bootstrap = twoStageBootstrap(rows, 40000, 20260722 + armSummaryRows.length * 1000);
  const counts = Object.fromEntries(labels.map((label) => [label, rows.filter((row) => row.label === label).length]));
  const row = { arm, arm_label: armNames[arm], ...summary };
  for (const label of labels) {
    const naive = wilson(counts[label], rows.length);
    row[`${label}_wilson_low`] = round(naive[0], 1);
    row[`${label}_wilson_high`] = round(naive[1], 1);
    row[`${label}_two_stage_bootstrap_low`] = round(bootstrap[label][0], 1);
    row[`${label}_two_stage_bootstrap_high`] = round(bootstrap[label][1], 1);
  }
  armSummaryRows.push(row);
}

const contrasts = [
  ["word_limit_30", "no_word_limit", "Removing the 30-word limit"],
  ["no_word_limit", "blank_system", "Removing the remaining style instructions"],
];
const contrastRows = [];
for (let index = 0; index < contrasts.length; index += 1) {
  const [armA, armB, contrast] = contrasts[index];
  const summaryA = summarize(arms[armA]);
  const summaryB = summarize(arms[armB]);
  const bootstrap = pairedBootstrapDifference(arms[armA], arms[armB], 40000, 20260730 + index * 1000);
  for (const label of labels) {
    contrastRows.push({
      contrast,
      from_arm: armNames[armA],
      to_arm: armNames[armB],
      category: label,
      percentage_point_difference: round(summaryB[`${label}_pct`] - summaryA[`${label}_pct`], 1),
      paired_two_stage_bootstrap_low: round(bootstrap[label][0], 1),
      paired_two_stage_bootstrap_high: round(bootstrap[label][1], 1),
      common_topics: new Set(arms[armA].map((row) => row.question_number).filter((topic) => arms[armB].some((row) => row.question_number === topic))).size,
    });
  }
}

const thresholdRows = [];
for (const [setName, questionNumbers] of Object.entries(thresholdSets)) {
  const set = new Set(questionNumbers);
  for (const sourceArm of ["blank_system"]) {
    const rows = actualRows.filter((row) => row.arm === sourceArm && set.has(row.question_number));
    const availableQuestionNumbers = [...new Set(rows.map((row) => row.question_number))].sort((a, b) => a - b);
    const missingQuestionNumbers = questionNumbers.filter((questionNumber) => !availableQuestionNumbers.includes(questionNumber));
    if (rows.length !== questionNumbers.length * 5) {
      throw new Error(`Incomplete ${setName}/${sourceArm}: ${rows.length}`);
    }
    thresholdRows.push({
      topic_set: setName,
      source_arm: sourceArm,
      source_arm_label: "Original wording, no system prompt",
      question_numbers: questionNumbers.join(" "),
      expected_topics: questionNumbers.length,
      available_question_numbers: availableQuestionNumbers.join(" "),
      missing_question_numbers: missingQuestionNumbers.join(" "),
      complete_topic_set: missingQuestionNumbers.length === 0,
      ...summarize(rows),
    });
  }
}

const repetitionRows = [];
for (const [arm, rows] of Object.entries(arms)) {
  for (let repetition = 1; repetition <= 5; repetition += 1) {
    repetitionRows.push({ arm, arm_label: armNames[arm], repetition, ...summarize(rows.filter((row) => row.repetition === repetition)) });
  }
}

const stabilityRows = [];
for (const [arm, rows] of Object.entries(arms)) {
  const grouped = groupByTopic(rows);
  let unanimous = 0;
  let mixedTwo = 0;
  let mixedThree = 0;
  for (const topicRows of grouped.values()) {
    const distinct = new Set(topicRows.map((row) => row.label)).size;
    if (distinct === 1) unanimous += 1;
    else if (distinct === 2) mixedTwo += 1;
    else mixedThree += 1;
  }
  stabilityRows.push({
    arm,
    arm_label: armNames[arm],
    topics: grouped.size,
    unanimous_topics: unanimous,
    unanimous_topics_pct: round(pct(unanimous, grouped.size), 1),
    topics_with_two_labels: mixedTwo,
    topics_with_three_labels: mixedThree,
  });
}

const endpointOrderRows = [];
for (const arm of ["word_limit_30", "no_word_limit", "blank_system"]) {
  const rows = arms[arm];
  for (const firstEndpoint of ["left", "right"]) {
    const selected = rows.filter((row) => (firstEndpointLeft.has(row.question_number) ? "left" : "right") === firstEndpoint);
    const summary = summarize(selected);
    const firstOnlyCount = firstEndpoint === "left" ? summary.left_n : summary.right_n;
    const secondOnlyCount = firstEndpoint === "left" ? summary.right_n : summary.left_n;
    endpointOrderRows.push({
      arm,
      arm_label: armNames[arm],
      first_endpoint_in_prompt: firstEndpoint,
      topics: new Set(selected.map((row) => row.question_number)).size,
      n: selected.length,
      first_endpoint_only_n: firstOnlyCount,
      first_endpoint_only_pct: round(pct(firstOnlyCount, selected.length), 1),
      second_endpoint_only_n: secondOnlyCount,
      second_endpoint_only_pct: round(pct(secondOnlyCount, selected.length), 1),
      ...summary,
    });
  }
}

const leaveOneOutRows = [];
for (const arm of ["no_fringe_questions_30"]) {
  const rows = arms[arm];
  const topics = [...new Set(rows.map((row) => row.question_number))].sort((a, b) => a - b);
  for (const omittedTopic of topics) {
    const kept = rows.filter((row) => row.question_number !== omittedTopic);
    const topicRow = rows.find((row) => row.question_number === omittedTopic);
    leaveOneOutRows.push({
      arm,
      arm_label: armNames[arm],
      omitted_question_number: omittedTopic,
      omitted_topic: topicRow.topic,
      ...summarize(kept),
    });
  }
}

function pearson(xs, ys) {
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }
  return numerator / Math.sqrt(sumX * sumY);
}

const wordLengthRows = [];
for (const arm of ["word_limit_30", "no_word_limit", "blank_system"]) {
  const rows = [...arms[arm]].sort((a, b) => a.word_count - b.word_count || a.question_number - b.question_number || a.repetition - b.repetition);
  const quartileRows = [];
  for (let index = 0; index < rows.length; index += 1) {
    const quartile = Math.min(4, Math.floor(index * 4 / rows.length) + 1);
    if (!quartileRows[quartile - 1]) quartileRows[quartile - 1] = [];
    quartileRows[quartile - 1].push(rows[index]);
  }
  const correlation = pearson(rows.map((row) => row.word_count), rows.map((row) => row.label === "both" ? 1 : 0));
  for (let index = 0; index < quartileRows.length; index += 1) {
    const selected = quartileRows[index];
    wordLengthRows.push({
      arm,
      arm_label: armNames[arm],
      word_count_quartile: index + 1,
      min_words: Math.min(...selected.map((row) => row.word_count)),
      max_words: Math.max(...selected.map((row) => row.word_count)),
      word_count_both_point_biserial_correlation: round(correlation, 3),
      ...summarize(selected),
    });
  }
}

const labelNoiseRows = [];
for (const [arm, rows] of Object.entries(arms)) {
  const base = summarize(rows);
  for (const assumedErrorPct of [1, 2, 5]) {
    const budget = assumedErrorPct;
    labelNoiseRows.push({
      arm,
      arm_label: armNames[arm],
      assumed_adversarial_label_error_pct: assumedErrorPct,
      left_low: round(Math.max(0, base.left_pct - budget), 1),
      left_high: round(Math.min(100, base.left_pct + budget), 1),
      both_low: round(Math.max(0, base.both_pct - budget), 1),
      both_high: round(Math.min(100, base.both_pct + budget), 1),
      right_low: round(Math.max(0, base.right_pct - budget), 1),
      right_high: round(Math.min(100, base.right_pct + budget), 1),
    });
  }
}

let validationSummary = null;
try { validationSummary = JSON.parse(await readFile(validationPath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const validationWilson = validationSummary?.n && Number.isFinite(validationSummary?.accuracy)
  ? wilson(Math.round(validationSummary.accuracy * validationSummary.n), validationSummary.n)
  : null;

const leaveOneOutRanges = Object.entries(Object.groupBy(leaveOneOutRows, (row) => row.arm)).map(([arm, rows]) => ({
  arm,
  arm_label: armNames[arm],
  ...Object.fromEntries(labels.flatMap((label) => {
    const values = rows.map((row) => row[`${label}_pct`]);
    const minRow = rows[values.indexOf(Math.min(...values))];
    const maxRow = rows[values.indexOf(Math.max(...values))];
    return [
      [`${label}_min_pct`, Math.min(...values)],
      [`${label}_min_when_omitting`, `${minRow.omitted_question_number}. ${minRow.omitted_topic}`],
      [`${label}_max_pct`, Math.max(...values)],
      [`${label}_max_when_omitting`, `${maxRow.omitted_question_number}. ${maxRow.omitted_topic}`],
    ];
  })),
}));

const output = {
  generated_at: new Date().toISOString(),
  source_rows: actualRows.length,
  bootstrap: {
    iterations: 40000,
    method: "Two-stage nonparametric bootstrap: resample topics with replacement, then responses within each sampled topic with replacement.",
    interpretation: "Intervals describe sensitivity to both topic composition and finite response sampling under an exchangeability assumption; they are not design-based confidence intervals for a prespecified population of political questions.",
  },
  threshold_sets: thresholdSets,
  arm_summaries: armSummaryRows,
  paired_contrasts: contrastRows,
  threshold_sensitivity: thresholdRows,
  repetition_sensitivity: repetitionRows,
  topic_label_stability: stabilityRows,
  endpoint_order_sensitivity: endpointOrderRows,
  leave_one_topic_out_ranges: leaveOneOutRanges,
  word_length_sensitivity: wordLengthRows,
  adversarial_label_noise: labelNoiseRows,
  judge_validation: validationSummary ? {
    ...validationSummary,
    accuracy_wilson_95_low: validationWilson ? round(validationWilson[0], 1) : null,
    accuracy_wilson_95_high: validationWilson ? round(validationWilson[1], 1) : null,
  } : {
    status: "not_archived",
    note: "Run code/validate-judge.mjs to create a marker-stripped validation result. The earlier annotation-bearing check is not treated as independent validation.",
  },
  audit_metadata: {
    note: "Threshold sets are derived directly from data/no-fringe-assessment.csv. They do not propagate polling sampling error or uncertainty in proxy judgments.",
    assessment_path: path.relative(repositoryRoot, assessmentPath) || ".",
    generation_records_total: allGenerations.length,
    successful_generations_used: generations.length,
    failed_generation_attempts_ignored: allGenerations.length - generations.length,
    judgment_records_total: allJudgments.length,
    successful_judgments_used: judgments.length,
    failed_judgment_attempts_ignored: allJudgments.length - judgments.length,
  },
};

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "summary.json"), JSON.stringify(output, null, 2) + "\n"),
  writeFile(path.join(outputDir, "arm-summary-with-uncertainty.csv"), toCsv(armSummaryRows)),
  writeFile(path.join(outputDir, "paired-contrasts.csv"), toCsv(contrastRows)),
  writeFile(path.join(outputDir, "threshold-and-evidence-sensitivity.csv"), toCsv(thresholdRows)),
  writeFile(path.join(outputDir, "repetition-sensitivity.csv"), toCsv(repetitionRows)),
  writeFile(path.join(outputDir, "topic-label-stability.csv"), toCsv(stabilityRows)),
  writeFile(path.join(outputDir, "endpoint-order-sensitivity.csv"), toCsv(endpointOrderRows)),
  writeFile(path.join(outputDir, "leave-one-topic-out.csv"), toCsv(leaveOneOutRows)),
  writeFile(path.join(outputDir, "leave-one-topic-out-ranges.csv"), toCsv(leaveOneOutRanges)),
  writeFile(path.join(outputDir, "word-length-sensitivity.csv"), toCsv(wordLengthRows)),
  writeFile(path.join(outputDir, "adversarial-label-noise.csv"), toCsv(labelNoiseRows)),
]);

console.log(JSON.stringify({
  outputDir,
  sourceRows: actualRows.length,
  armSummaries: armSummaryRows.length,
  pairedContrasts: contrastRows.length,
  thresholdRows: thresholdRows.length,
  repetitionRows: repetitionRows.length,
  leaveOneOutRows: leaveOneOutRows.length,
}, null, 2));
