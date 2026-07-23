#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// Primary analysis for the Claude Opus 4.8 replication. Joins generations to
// Fable 5 judgments, derives the No Fringe Questions subset, recomputes the
// Washington Post comparator directly from the vendored frozen source, and
// writes the public CSVs plus the deterministic label-verification sample.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(CODE_DIR, "..");
const LABELS = ["left", "both", "right"];
const WAPO_MODEL = "anthropic/claude-opus-4-8";
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

export function parseCsv(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(Boolean)) records.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }
  const headers = records.shift() ?? [];
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns = Object.keys(rows[0] ?? {})) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

const round1 = (value) => Math.round(value * 10) / 10;
const percent = (count, total) => (total ? (100 * count) / total : 0);

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
const outputDirectory = path.resolve(options.output ?? path.join(REPOSITORY_ROOT, "data"));
const docsDirectory = path.resolve(options.docs ?? path.join(REPOSITORY_ROOT, "docs"));
const assessmentPath = path.resolve(options.assessment ?? path.join(REPOSITORY_ROOT, "data", "no-fringe-assessment.csv"));
const wapoCsvPath = path.resolve(
  options["wapo-csv"] ??
    path.join(REPOSITORY_ROOT, "vendor", "washington-post-source", "data", "clean", "modelslant-responses-raw.csv"),
);

const generations = (await loadJsonl(path.join(runDirectory, "generations.jsonl"))).filter(
  (row) => row.status === "ok" && row.stop_reason !== "max_tokens",
);
const judgments = (await loadJsonl(path.join(runDirectory, "judgments.jsonl"))).filter((row) => row.status === "ok");
const judgmentByKey = new Map(judgments.map((row) => [row.key, row]));
const assessmentRows = parseCsv(await readFile(assessmentPath, "utf8"));
const includedQuestions = new Set(assessmentRows.filter((row) => row.decision === "pass").map((row) => Number(row.question_number)));

// Washington Post comparator, recomputed from the vendored frozen source.
const wapoRows = parseCsv(await readFile(wapoCsvPath, "utf8")).filter((row) => row.model === WAPO_MODEL);
const wapoCounts = Object.fromEntries(LABELS.map((label) => [label, wapoRows.filter((row) => row.lean === label).length]));
if (wapoRows.length !== 30) throw new Error(`Expected 30 WaPo rows for ${WAPO_MODEL}, found ${wapoRows.length}`);

const responseRows = generations
  .filter((generation) => judgmentByKey.has(generation.key))
  .map((generation) => {
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
      generation_stop_reason: generation.stop_reason,
      response: generation.response,
      word_count: generation.word_count,
      word_limit_compliant: generation.word_limit_compliant,
      requested_judge_model: judgment.requested_model,
      actual_judge_model: judgment.actual_model,
      judge_response_id: judgment.response_id,
      classification: judgment.label,
      raw_judge_response: judgment.raw_judge_response,
      raw_answer_is_exact_label: judgment.raw_answer_is_exact_label,
      generation_usage: generation.usage,
      judge_usage: judgment.usage,
      generation_created_at: generation.created_at,
      judgment_created_at: judgment.created_at,
    };
  });

const analysisRows = [
  ...responseRows.map((row) => ({ ...row, analysis_arm: row.source_arm, derived_from: "" })),
  ...responseRows
    .filter((row) => row.source_arm === "blank_system" && includedQuestions.has(Number(row.question_number)))
    .map((row) => ({ ...row, analysis_arm: "no_fringe_questions_30", derived_from: "blank_system" })),
];

const summaries = ARM_DEFINITIONS.map(([arm, label]) => summarize(analysisRows.filter((row) => row.analysis_arm === arm), arm, label));
const chartSummary = [
  {
    arm: "washington_post_experiment",
    label: "Washington Post Experiment",
    topics: 30,
    n: wapoRows.length,
    left_only_n: wapoCounts.left,
    left_only_pct: round1(percent(wapoCounts.left, wapoRows.length)),
    both_n: wapoCounts.both,
    both_pct: round1(percent(wapoCounts.both, wapoRows.length)),
    right_only_n: wapoCounts.right,
    right_only_pct: round1(percent(wapoCounts.right, wapoRows.length)),
    basis: "Recomputed from the vendored frozen source; one reporter-coded response per topic.",
  },
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
      : "Local Claude API responses; five samples per topic.",
  })),
];

const topicSummary = [];
for (const [arm, label] of ARM_DEFINITIONS) {
  const rowsForArm = analysisRows.filter((row) => row.analysis_arm === arm);
  for (const questionNumber of [...new Set(rowsForArm.map((row) => Number(row.question_number)))].sort((a, b) => a - b)) {
    const rows = rowsForArm.filter((row) => Number(row.question_number) === questionNumber);
    const counts = Object.fromEntries(LABELS.map((category) => [category, rows.filter((row) => row.classification === category).length]));
    topicSummary.push({
      arm,
      arm_label: label,
      question_number: questionNumber,
      topic: rows[0].topic,
      prompt: rows[0].prompt,
      n: rows.length,
      left_only_n: counts.left,
      left_only_pct: round1(percent(counts.left, rows.length)),
      both_n: counts.both,
      both_pct: round1(percent(counts.both, rows.length)),
      right_only_n: counts.right,
      right_only_pct: round1(percent(counts.right, rows.length)),
      mean_words: round1(rows.reduce((sum, row) => sum + row.word_count, 0) / rows.length),
    });
  }
}

// Deterministic manual label-verification sample from the capped arm:
// sort by question number then repetition, take every k-th to spread across
// topics, first ten per requested label.
function systematicSample(rows, size) {
  const sorted = [...rows].sort((a, b) => a.question_number - b.question_number || a.repetition - b.repetition);
  if (sorted.length <= size) return sorted;
  const step = sorted.length / size;
  const selected = [];
  for (let index = 0; index < size; index += 1) selected.push(sorted[Math.floor(index * step)]);
  return selected;
}
const cappedRows = analysisRows.filter((row) => row.analysis_arm === "word_limit_30");
const sampleLeft = systematicSample(cappedRows.filter((row) => row.classification === "left"), 10);
const sampleBoth = systematicSample(cappedRows.filter((row) => row.classification === "both"), 10);
const verificationRows = [...sampleLeft, ...sampleBoth].map((row) => ({
  source_key: row.source_key,
  question_number: row.question_number,
  topic: row.topic,
  repetition: row.repetition,
  prompt: row.prompt,
  left_endpoint: row.left_endpoint,
  right_endpoint: row.right_endpoint,
  response: row.response,
  classification: row.classification,
  raw_judge_response: row.raw_judge_response,
}));
const verificationMarkdown = [
  "# Manual label-verification sample",
  "",
  "Twenty responses from the `Replication of WaPo` condition, selected deterministically after sorting by question number and repetition: ten labeled `left` and ten labeled `both`." +
    (sampleLeft.length < 10 ? ` Only ${sampleLeft.length} left-labeled responses exist, so all are included.` : "") +
    (sampleBoth.length < 10 ? ` Only ${sampleBoth.length} both-labeled responses exist, so all are included.` : ""),
  "",
  ...verificationRows.flatMap((row) => [
    `## ${row.source_key} — ${row.topic} (${row.classification})`,
    "",
    `- **Prompt:** ${row.prompt}`,
    `- **Left endpoint:** ${row.left_endpoint}`,
    `- **Right endpoint:** ${row.right_endpoint}`,
    `- **Fable label:** \`${row.classification}\` (raw answer: \`${row.raw_judge_response}\`)`,
    "",
    `> ${row.response.replaceAll("\n", "\n> ")}`,
    "",
  ]),
].join("\n");

await mkdir(outputDirectory, { recursive: true });
await mkdir(docsDirectory, { recursive: true });
await Promise.all([
  writeFile(
    path.join(outputDirectory, "summary-statistics.csv"),
    toCsv(chartSummary, ["arm", "label", "topics", "n", "left_only_n", "left_only_pct", "both_n", "both_pct", "right_only_n", "right_only_pct", "basis"]),
    "utf8",
  ),
  writeFile(path.join(outputDirectory, "local-arm-statistics.csv"), toCsv(summaries), "utf8"),
  writeFile(path.join(outputDirectory, "topic-summary.csv"), toCsv(topicSummary), "utf8"),
  writeFile(path.join(outputDirectory, "responses.csv"), toCsv(responseRows), "utf8"),
  writeFile(
    path.join(outputDirectory, "analysis-rows.csv"),
    toCsv(analysisRows.map(({ generation_usage, judge_usage, ...row }) => row)),
    "utf8",
  ),
  writeFile(path.join(outputDirectory, "label-verification-sample.csv"), toCsv(verificationRows), "utf8"),
  writeFile(path.join(docsDirectory, "label-verification-sample.md"), `${verificationMarkdown}\n`, "utf8"),
]);

console.log(
  JSON.stringify(
    {
      runDirectory,
      outputDirectory,
      generations: generations.length,
      judgments: judgments.length,
      joinedResponses: responseRows.length,
      analysisRows: analysisRows.length,
      wapoComparator: wapoCounts,
      includedQuestions: [...includedQuestions].sort((a, b) => a - b),
      summaries,
    },
    null,
    2,
  ),
)
