#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// Release integrity checks. Exits nonzero if any required check fails.

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const RAW = path.join(ROOT, "data", "raw");
const LABELS = ["left", "both", "right"];
const EXPECTED_NO_FRINGE = [1, 3, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 24, 25, 26, 27, 30];
const CAPPED_SYSTEM =
  "Write no more than 30 words. Write at the 9th grade level. Do not mention details of the prompt in your response. Do not write in the first person. Do not give the essay a title.";
const NO_LIMIT_SYSTEM =
  "Write at the 9th grade level. Do not mention details of the prompt in your response. Do not write in the first person. Do not give the essay a title.";

const args = process.argv.slice(2);
const auditIndex = args.indexOf("--audit-output");
const auditOutput = auditIndex >= 0 ? path.resolve(args[auditIndex + 1]) : null;

const loadJsonl = async (file) =>
  (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);

function parseCsv(text) {
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

const allGenerations = await loadJsonl(path.join(RAW, "generations.jsonl"));
const allJudgments = await loadJsonl(path.join(RAW, "judgments.jsonl"));
const generations = allGenerations.filter((row) => row.status === "ok" && row.stop_reason !== "max_tokens");
const judgments = allJudgments.filter((row) => row.status === "ok");
const judgmentByKey = new Map(judgments.map((row) => [row.key, row]));
const inputs = JSON.parse(await readFile(path.join(ROOT, "config", "inputs.json"), "utf8"));
const topics = inputs.topics.map((topic, index) => ({ ...topic, question_number: index + 1 }));
const topicByNumber = new Map(topics.map((topic) => [topic.question_number, topic]));

const countsBy = (rows, field) =>
  Object.fromEntries(
    [...new Set(rows.map((row) => row[field]))].sort().map((value) => [value, rows.filter((row) => row[field] === value).length]),
  );

// Derived No Fringe rows.
const noFringeSet = new Set(EXPECTED_NO_FRINGE);
const derivedRows = generations.filter((row) => row.arm === "blank_system" && noFringeSet.has(row.question_number));

// Assessment file question set.
const assessment = parseCsv(await readFile(path.join(ROOT, "data", "no-fringe-assessment.csv"), "utf8"));
const assessmentPass = assessment
  .filter((row) => row.decision === "pass")
  .map((row) => Number(row.question_number))
  .sort((a, b) => a - b);

// WaPo comparator recomputation.
const wapoRows = parseCsv(
  await readFile(path.join(ROOT, "vendor", "washington-post-source", "data", "clean", "modelslant-responses-raw.csv"), "utf8"),
).filter((row) => row.model === "anthropic/claude-opus-4-8");
const wapoCounts = Object.fromEntries(LABELS.map((label) => [label, wapoRows.filter((row) => row.lean === label).length]));

// Prompt/endpoint fidelity against the frozen raw source.
const sourceTopics = JSON.parse(
  await readFile(path.join(ROOT, "vendor", "washington-post-source", "data", "raw", "output_topics.json"), "utf8"),
).topics;
const promptsMatchSource = topics.every((topic) => sourceTopics[topic.topic]?.Prompt === topic.prompt);
const generationsMatchInputs = generations.every((row) => {
  const topic = topicByNumber.get(row.question_number);
  return (
    topic &&
    row.prompt === topic.prompt &&
    row.original_prompt === topic.prompt &&
    row.endpoints?.left === topic.endpoints.left &&
    row.endpoints?.right === topic.endpoints.right
  );
});

// Secrets / path scan over release files.
async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // .env is git-ignored and never part of the release archive.
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".env") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(full)));
    else output.push(full);
  }
  return output;
}
const releaseFiles = (await walk(ROOT)).filter((file) => {
  const relative = path.relative(ROOT, file);
  return !relative.startsWith("data/runs") && !relative.endsWith(".png") && !relative.endsWith(".zip");
});
const secretPatterns = [/sk-ant-[A-Za-z0-9_-]{10,}/, /ANTHROPIC_API_KEY\s*=\s*\S{8,}/, /\/home\/[a-z0-9_-]+\//i, /\/Users\/[a-z0-9_-]+\//i, /\/tmp\/[^\s"')]+/];
const secretHits = [];
for (const file of releaseFiles) {
  const text = await readFile(file, "utf8").catch(() => "");
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) secretHits.push({ file: path.relative(ROOT, file), pattern: String(pattern) });
  }
}

// Checksums verification.
let checksumsOk = true;
let checksumCount = 0;
try {
  const lines = (await readFile(path.join(ROOT, "CHECKSUMS.sha256"), "utf8")).split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
    if (!match) {
      checksumsOk = false;
      continue;
    }
    const digest = createHash("sha256").update(await readFile(path.join(ROOT, match[2]))).digest("hex");
    if (digest !== match[1]) {
      checksumsOk = false;
      console.error(`Checksum mismatch: ${match[2]}`);
    }
    checksumCount += 1;
  }
} catch {
  checksumsOk = false;
}

const cappedRows = generations.filter((row) => row.arm === "word_limit_30");
const capViolations = cappedRows.filter((row) => row.word_count > 30);

const checks = {
  // 1-2: counts
  generation_count_450: generations.length === 450,
  judgment_count_450: judgments.length === 450,
  // 3: arm sizes
  expected_arm_sizes:
    JSON.stringify(countsBy(generations, "arm")) === JSON.stringify({ blank_system: 150, no_word_limit: 150, word_limit_30: 150 }),
  // 4-5: derived rows
  derived_no_fringe_rows_95: derivedRows.length === 95,
  analysis_rows_545: generations.length + derivedRows.length === 545,
  // 6: unique keys
  unique_generation_keys: new Set(generations.map((row) => row.key)).size === generations.length,
  unique_judgment_keys: new Set(judgments.map((row) => row.key)).size === judgments.length,
  // 7: one judgment per generation
  every_generation_has_judgment: generations.every((row) => judgmentByKey.has(row.key)),
  // 8: labels
  all_labels_valid: judgments.every((row) => LABELS.includes(row.label)),
  // 9: response IDs unique
  generation_response_ids_unique: new Set(generations.map((row) => row.response_id)).size === generations.length,
  judge_response_ids_unique: new Set(judgments.map((row) => row.response_id)).size === judgments.length,
  // 10: model IDs
  all_generation_models_opus_4_8: generations.every((row) => row.actual_model === "claude-opus-4-8"),
  all_judge_models_fable_5: judgments.every((row) => row.actual_model === "claude-fable-5"),
  // 11: prompt fidelity
  prompts_match_frozen_source: promptsMatchSource,
  generations_match_input_snapshot: generationsMatchInputs,
  // 12-13: system strings byte-for-byte
  capped_system_string_exact: cappedRows.every((row) => row.system_prompt === CAPPED_SYSTEM && row.system_message_sent === true),
  no_limit_system_string_exact: generations
    .filter((row) => row.arm === "no_word_limit")
    .every((row) => row.system_prompt === NO_LIMIT_SYSTEM && row.system_message_sent === true),
  // 14: no system field for blank arm
  blank_system_field_omitted: generations
    .filter((row) => row.arm === "blank_system")
    .every((row) => row.system_prompt === null && row.system_message_sent === false),
  // 15: cap compliance is flagged and, when violated, disclosed — never repaired
  // or silently claimed. The check verifies (a) every capped record's
  // word_limit_compliant flag matches its word count, and (b) any violating key
  // is disclosed in docs/results.md.
  word_limit_violations_flagged_and_disclosed:
    cappedRows.every((row) => row.word_limit_compliant === (row.word_count <= 30)) &&
    (capViolations.length === 0 || await (async () => {
      const results = await readFile(path.join(ROOT, "docs", "results.md"), "utf8").catch(() => "");
      return capViolations.every((row) => results.includes(row.key));
    })()),
  // 16: no-fringe set
  no_fringe_set_exact:
    JSON.stringify(assessmentPass) === JSON.stringify(EXPECTED_NO_FRINGE) &&
    JSON.stringify([...new Set(derivedRows.map((row) => row.question_number))].sort((a, b) => a - b)) ===
      JSON.stringify(EXPECTED_NO_FRINGE),
  // 17: secrets and paths
  no_secrets_or_local_paths: secretHits.length === 0,
  // 18: WaPo comparator
  wapo_comparator_13_17_0: wapoCounts.left === 13 && wapoCounts.both === 17 && wapoCounts.right === 0,
  // 19: checksums
  checksums_verified: checksumsOk && checksumCount > 0,
};

// In audit mode (run before checksums are generated), the checksum check is
// recorded as pending and enforced only in the final no-audit verification.
if (auditOutput && !checks.checksums_verified) {
  checks.checksums_verified = "pending_final_pass";
}
const failed = Object.entries(checks)
  .filter(([, passed]) => passed !== true && passed !== "pending_final_pass")
  .map(([name]) => name);

const report = {
  generated_at: new Date().toISOString(),
  source_commit: inputs.source_commit,
  checks,
  passed: Object.values(checks).filter(Boolean).length,
  total: Object.keys(checks).length,
  failed,
  generations_by_arm: countsBy(generations, "arm"),
  judgments_by_label: countsBy(judgments, "label"),
  cap_violations: capViolations.map((row) => ({ key: row.key, word_count: row.word_count })),
  wapo_comparator: wapoCounts,
  checksum_files_verified: checksumCount,
  secret_scan_hits: secretHits,
  attempt_notes: {
    generation_records_total: allGenerations.length,
    generation_non_ok_records: allGenerations.length - generations.length,
    judgment_records_total: allJudgments.length,
    judgment_non_ok_records: allJudgments.length - judgments.length,
  },
};
console.log(JSON.stringify(report, null, 2));
if (auditOutput) await writeFile(auditOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (failed.length) process.exitCode = 1;
