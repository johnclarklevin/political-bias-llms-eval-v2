#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(CODE_DIR, "..");
const LABELS = ["left", "both", "right"];
const ARM_DEFINITIONS = [
  ["word_limit_30", "Replication of WaPo"],
  ["no_word_limit", "No Word Limit"],
  ["blank_system", "No System Prompt"],
  ["no_fringe_questions_30", "No Fringe Questions"],
];

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

async function loadJsonl(file) {
  return (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

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

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns = Object.keys(rows[0] ?? {})) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

function successfulByKey(rows, kind) {
  const successful = rows.filter((row) => row.status === "ok");
  const byKey = new Map();
  for (const row of successful) {
    if (byKey.has(row.key)) throw new Error(`Duplicate successful ${kind} record for ${row.key}`);
    byKey.set(row.key, row);
  }
  return byKey;
}

function truthy(value) {
  return ["1", "true", "yes", "pass"].includes(String(value ?? "").trim().toLowerCase());
}

const round1 = (value) => Math.round(value * 10) / 10;
const percent = (count, total) => total ? 100 * count / total : 0;

function summarize(rows, arm, label) {
  const counts = Object.fromEntries(LABELS.map((category) => [category, rows.filter((row) => row.classification === category).length]));
  return {
    arm,
    label,
    topics: new Set(rows.map((row) => row.question_number)).size,
    n: rows.length,
    left_only_n: counts.left,
    left_only_pct: round1(percent(counts.left, rows.length)),
    both_n: counts.both,
    both_pct: round1(percent(counts.both, rows.length)),
    right_only_n: counts.right,
    right_only_pct: round1(percent(counts.right, rows.length)),
    mean_words: round1(rows.reduce((sum, row) => sum + row.word_count, 0) / rows.length),
    derived_from: arm === "no_fringe_questions_30" ? "blank_system" : "",
  };
}

const options = parseArgs(process.argv.slice(2));
const runDirectory = path.resolve(options.run ?? path.join(REPOSITORY_ROOT, "data", "raw"));
const outputDirectory = path.resolve(options.output ?? path.join(REPOSITORY_ROOT, "data", "recomputed"));
const assessmentPath = path.resolve(options.assessment ?? path.join(REPOSITORY_ROOT, "data", "no-fringe-assessment.csv"));

const allGenerations = await loadJsonl(path.join(runDirectory, "generations.jsonl"));
const allJudgments = await loadJsonl(path.join(runDirectory, "judgments.jsonl"));
const generationByKey = successfulByKey(allGenerations, "generation");
const judgmentByKey = successfulByKey(allJudgments, "judgment");
const generations = [...generationByKey.values()];
const judgments = [...judgmentByKey.values()];
const assessmentRows = parseCsv(await readFile(assessmentPath, "utf8"));
const includedQuestions = new Set(assessmentRows
  .filter((row) => row.passes_30_percent === undefined ? row.decision === "pass" : truthy(row.passes_30_percent))
  .map((row) => Number(row.question_number)));

const missingJudgments = generations.filter((generation) => !judgmentByKey.has(generation.key)).map((row) => row.key);
const orphanJudgments = judgments.filter((judgment) => !generationByKey.has(judgment.key)).map((row) => row.key);
const invalidJudgments = judgments.filter((judgment) => !LABELS.includes(judgment.label)).map((row) => row.key);
if (invalidJudgments.length) throw new Error(`Invalid successful judgment labels for: ${invalidJudgments.slice(0, 10).join(", ")}`);
if ((missingJudgments.length || orphanJudgments.length) && options["allow-incomplete"] !== "true") {
  throw new Error(`Incomplete run: ${missingJudgments.length} generation(s) lack judgments and ${orphanJudgments.length} judgment(s) lack generations. Re-run the harness or pass --allow-incomplete true.`);
}

const responseRows = generations.filter((generation) => judgmentByKey.has(generation.key)).map((generation) => {
  const judgment = judgmentByKey.get(generation.key);
  return {
    source_key: generation.key,
    question_number: generation.question_number,
    topic: generation.topic,
    source_arm: generation.arm,
    repetition: generation.repetition,
    prompt: generation.prompt,
    left_endpoint: generation.endpoints?.left,
    right_endpoint: generation.endpoints?.right,
    system_prompt: generation.system_prompt,
    system_message_sent: generation.system_message_sent,
    requested_generation_model: generation.requested_model,
    actual_generation_model: generation.actual_model,
    generation_response_id: generation.response_id,
    response: generation.response,
    word_count: generation.word_count,
    word_limit_compliant: generation.word_limit_compliant,
    requested_judge_model: judgment.requested_model,
    actual_judge_model: judgment.actual_model,
    judge_response_id: judgment.response_id,
    classification: judgment.label,
    raw_judge_response: judgment.raw_judge_response,
    generation_usage: generation.usage,
    judge_usage: judgment.usage,
    generation_created_at: generation.created_at,
    judgment_created_at: judgment.created_at,
  };
});

const analysisRows = [
  ...responseRows.map((row) => ({ ...row, analysis_arm: row.source_arm, derived_from: "" })),
  ...responseRows.filter((row) => row.source_arm === "blank_system" && includedQuestions.has(Number(row.question_number)))
    .map((row) => ({ ...row, analysis_arm: "no_fringe_questions_30", derived_from: "blank_system" })),
];

const summaries = ARM_DEFINITIONS.map(([arm, label]) => summarize(analysisRows.filter((row) => row.analysis_arm === arm), arm, label));
const chartSummary = [
  { arm: "washington_post_experiment", label: "Washington Post Experiment", topics: 30, n: 30, left_only_n: 24, left_only_pct: 80, both_n: 5, both_pct: 16.7, right_only_n: 1, right_only_pct: 3.3, basis: "Main article chart; one reporter-coded response per topic." },
  ...summaries.map((row) => ({
    arm: row.arm,
    label: row.label,
    topics: row.topics,
    n: row.n,
    left_only_n: row.left_only_n,
    left_only_pct: row.left_only_pct,
    both_n: row.both_n,
    both_pct: row.both_pct,
    right_only_n: row.right_only_n,
    right_only_pct: row.right_only_pct,
    basis: row.derived_from
      ? "Derived subset of the existing blank-system responses."
      : "Local API responses; five samples per topic.",
  })),
];

const topicSummary = [];
for (const [arm, label] of ARM_DEFINITIONS) {
  const rowsForArm = analysisRows.filter((row) => row.analysis_arm === arm);
  for (const questionNumber of [...new Set(rowsForArm.map((row) => Number(row.question_number)))].sort((a, b) => a - b)) {
    const rows = rowsForArm.filter((row) => Number(row.question_number) === questionNumber);
    const counts = Object.fromEntries(LABELS.map((category) => [category, rows.filter((row) => row.classification === category).length]));
    topicSummary.push({
      arm, arm_label: label, question_number: questionNumber, topic: rows[0].topic, prompt: rows[0].prompt, n: rows.length,
      left_only_n: counts.left, left_only_pct: round1(percent(counts.left, rows.length)),
      both_n: counts.both, both_pct: round1(percent(counts.both, rows.length)),
      right_only_n: counts.right, right_only_pct: round1(percent(counts.right, rows.length)),
      mean_words: round1(rows.reduce((sum, row) => sum + row.word_count, 0) / rows.length),
    });
  }
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, "summary-statistics.csv"), toCsv(chartSummary, [
    "arm", "label", "topics", "n", "left_only_n", "left_only_pct", "both_n", "both_pct",
    "right_only_n", "right_only_pct", "basis",
  ]), "utf8"),
  writeFile(path.join(outputDirectory, "local-arm-statistics.csv"), toCsv(summaries), "utf8"),
  writeFile(path.join(outputDirectory, "topic-summary.csv"), toCsv(topicSummary), "utf8"),
  writeFile(path.join(outputDirectory, "responses.csv"), toCsv(responseRows), "utf8"),
  writeFile(path.join(outputDirectory, "analysis-rows.csv"), toCsv(analysisRows), "utf8"),
]);

console.log(JSON.stringify({
  runDirectory,
  outputDirectory,
  generation_records: allGenerations.length,
  judgment_records: allJudgments.length,
  successful_generations: generations.length,
  successful_judgments: judgments.length,
  failed_generation_attempts: allGenerations.length - generations.length,
  failed_judgment_attempts: allJudgments.length - judgments.length,
  missing_judgments: missingJudgments,
  orphan_judgments: orphanJudgments,
  joinedResponses: responseRows.length,
  analysisRows: analysisRows.length,
  includedQuestions: [...includedQuestions].sort((a, b) => a - b),
  summaries,
}, null, 2));
