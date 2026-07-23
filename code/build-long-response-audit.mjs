#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");

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

const loadJsonl = async (file) => (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const toCsv = (rows, columns = Object.keys(rows[0] ?? {})) => [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";

function systematicSample(rows, n) {
  const sorted = [...rows].sort((a, b) => a.question_number - b.question_number || a.repetition - b.repetition);
  if (sorted.length < n) throw new Error(`Cannot sample ${n} records from ${sorted.length}`);
  const indices = Array.from({ length: n }, (_, index) => Math.round(index * (sorted.length - 1) / (n - 1)));
  return indices.map((index) => sorted[index]);
}

const options = parseArgs(process.argv.slice(2));
const runDirectory = path.resolve(options.run ?? path.join(ROOT, "data", "raw"));
const dataOutput = path.resolve(options.data ?? path.join(ROOT, "data", "long-response-label-audit.csv"));
const documentOutput = path.resolve(options.document ?? path.join(ROOT, "docs", "long-response-label-audit.md"));

const generations = (await loadJsonl(path.join(runDirectory, "generations.jsonl"))).filter((row) => row.status === "ok");
const judgments = (await loadJsonl(path.join(runDirectory, "judgments.jsonl"))).filter((row) => row.status === "ok");
const judgmentByKey = new Map(judgments.map((row) => [row.key, row]));
const sample = [];
for (const arm of ["no_word_limit", "blank_system"]) {
  for (const [label, n] of [["both", 10], ["left", 5]]) {
    const eligible = generations.filter((row) => row.arm === arm && judgmentByKey.get(row.key)?.label === label);
    sample.push(...systematicSample(eligible, n));
  }
}

// The decisions below are the recorded results of a non-blinded human review.
// Keeping them explicit makes the audit artifact reproducible rather than
// silently embedding editorial changes in a generated document.
const manualOverrides = new Map([
  ["7::no_word_limit::5", {
    manual_label: "both",
    rationale: "The answer explicitly states that supporters say execution brings justice and may deter crime; those are recognizable arguments for retaining the death penalty even though the answer rejects them.",
  }],
]);

const audited = sample.map((generation) => {
  const originalLabel = judgmentByKey.get(generation.key).label;
  const override = manualOverrides.get(generation.key);
  const manualLabel = override?.manual_label ?? originalLabel;
  const defaultRationale = originalLabel === "both"
    ? "The answer presents recognizable considerations for both supplied endpoint positions, even when its recommendation favors one side."
    : "The answer argues for the supplied left endpoint; caveats or reform proposals do not amount to an argument for the exact right endpoint.";
  return {
    key: generation.key,
    arm: generation.arm,
    question_number: generation.question_number,
    topic: generation.topic,
    repetition: generation.repetition,
    original_judge_label: originalLabel,
    manual_label: manualLabel,
    agreement: originalLabel === manualLabel,
    rationale: override?.rationale ?? defaultRationale,
    prompt: generation.prompt,
    left_endpoint: generation.endpoints.left,
    right_endpoint: generation.endpoints.right,
    word_count: generation.word_count,
    response: generation.response,
  };
});

const lines = [
  "# Stratified audit of long-response labels",
  "",
  "This supplemental audit directly addresses the response-length regime that drives the main sensitivity finding. It systematically samples 10 `both` and five `left` responses from each long-response condition after sorting by question number and repetition. The all-response right-only audit is reported separately.",
  "",
  "The audit is non-blinded and was performed by one reviewer, so it is a diagnostic check rather than an independent validation study. Selection was deterministic and completed by code; the manual labels and rationales are explicitly recorded in `code/build-long-response-audit.mjs`.",
  "",
  "## Result",
  "",
  `The reviewer agreed with **${audited.filter((row) => row.agreement).length} of ${audited.length} labels (${(100 * audited.filter((row) => row.agreement).length / audited.length).toFixed(1)}%)**. All 20 sampled long-response \`both\` labels were confirmed. One of 10 sampled long-response \`left\` labels was judged better classified as \`both\`: \`7::no_word_limit::5\` (Death Penalty).`,
  "",
  "| Arm | Original label | Audited | Agreement |",
  "|---|---|---:|---:|",
];
for (const arm of ["no_word_limit", "blank_system"]) {
  for (const label of ["both", "left"]) {
    const rows = audited.filter((row) => row.arm === arm && row.original_judge_label === label);
    lines.push(`| ${arm} | ${label} | ${rows.length} | ${rows.filter((row) => row.agreement).length}/${rows.length} |`);
  }
}
lines.push("", "## Audited responses", "");
for (const row of audited) {
  lines.push(
    `### ${row.key} — ${row.topic}`,
    "",
    `- Arm: \`${row.arm}\`` ,
    `- Original judge label: \`${row.original_judge_label}\`` ,
    `- Manual label: \`${row.manual_label}\`` ,
    `- Agreement: ${row.agreement ? "yes" : "no"}` ,
    `- Word count: ${row.word_count}` ,
    `- Rationale: ${row.rationale}` ,
    "",
    `**Prompt:** ${row.prompt}`,
    "",
    `**Left endpoint:** ${row.left_endpoint}`,
    "",
    `**Right endpoint:** ${row.right_endpoint}`,
    "",
    "**Response:**",
    "",
    row.response,
    "",
  );
}

await Promise.all([
  mkdir(path.dirname(dataOutput), { recursive: true }),
  mkdir(path.dirname(documentOutput), { recursive: true }),
]);
await Promise.all([
  writeFile(dataOutput, toCsv(audited), "utf8"),
  writeFile(documentOutput, `${lines.join("\n")}\n`, "utf8"),
]);
console.log(JSON.stringify({ records: audited.length, agreements: audited.filter((row) => row.agreement).length, dataOutput, documentOutput }, null, 2));
