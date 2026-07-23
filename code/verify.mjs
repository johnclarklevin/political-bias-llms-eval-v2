#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const LABELS = new Set(["left", "both", "right"]);

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

const loadJsonl = async (file) => (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
const countsBy = (rows, field) => Object.fromEntries([...new Set(rows.map((row) => row[field]))].sort().map((value) => [value, rows.filter((row) => row[field] === value).length]));
const truthy = (value) => ["1", "true", "yes", "pass"].includes(String(value ?? "").trim().toLowerCase());
const portablePath = (target) => path.relative(ROOT, target) || ".";

function successfulByKey(rows, kind) {
  const byKey = new Map();
  const duplicates = [];
  for (const row of rows.filter((candidate) => candidate.status === "ok")) {
    if (byKey.has(row.key)) duplicates.push(row.key);
    else byKey.set(row.key, row);
  }
  return { byKey, duplicates };
}

const options = parseArgs(process.argv.slice(2));
const runDirectory = path.resolve(options.run ?? path.join(ROOT, "data", "raw"));
const assessmentPath = path.resolve(options.assessment ?? path.join(ROOT, "data", "no-fringe-assessment.csv"));
const inputsPath = path.resolve(options.inputs ?? path.join(ROOT, "config", "inputs.json"));
const validationPath = path.resolve(options.validation ?? path.join(ROOT, "data", "judge-validation", "summary.json"));
const outputPath = options.output ? path.resolve(options.output) : null;

const generationRecords = await loadJsonl(path.join(runDirectory, "generations.jsonl"));
const judgmentRecords = await loadJsonl(path.join(runDirectory, "judgments.jsonl"));
const generationsResult = successfulByKey(generationRecords, "generation");
const judgmentsResult = successfulByKey(judgmentRecords, "judgment");
const generations = [...generationsResult.byKey.values()];
const judgments = [...judgmentsResult.byKey.values()];
const generationKeys = new Set(generationsResult.byKey.keys());
const judgmentKeys = new Set(judgmentsResult.byKey.keys());
const missingJudgments = [...generationKeys].filter((key) => !judgmentKeys.has(key));
const orphanJudgments = [...judgmentKeys].filter((key) => !generationKeys.has(key));
const assessmentRows = parseCsv(await readFile(assessmentPath, "utf8"));
const threshold30Topics = assessmentRows.filter((row) => truthy(row.passes_30_percent ?? (row.decision === "pass" ? "true" : "false")));
const inputs = JSON.parse(await readFile(inputsPath, "utf8"));
let validationSummary = null;
try { validationSummary = JSON.parse(await readFile(validationPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }

let rawManifest = null;
try { rawManifest = JSON.parse(await readFile(path.join(runDirectory, "manifest.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const armById = new Map((rawManifest?.physical_arms ?? []).map((arm) => [arm.id, arm]));
const threshold30QuestionNumbers = threshold30Topics.map((row) => Number(row.question_number)).sort((a, b) => a - b);
const manifestThreshold30QuestionNumbers = (rawManifest?.derived_arms ?? [])
  .find((arm) => arm.id === "no_fringe_questions_30")?.questionNumbers
  ?.map(Number).sort((a, b) => a - b) ?? [];
const expectedKeys = new Set();
for (let questionNumber = 1; questionNumber <= inputs.topics.length; questionNumber += 1) {
  for (const arm of rawManifest?.physical_arms ?? []) {
    for (let repetition = 1; repetition <= Number(rawManifest?.repetitions ?? 0); repetition += 1) expectedKeys.add(`${questionNumber}::${arm.id}::${repetition}`);
  }
}
const promptAndEndpointMatches = generations.every((row) => {
  const topic = inputs.topics[Number(row.question_number) - 1];
  return topic
    && row.topic === topic.topic
    && row.prompt === topic.prompt
    && row.endpoints?.left === topic.endpoints.left
    && row.endpoints?.right === topic.endpoints.right;
});
const systemMatches = generations.every((row) => {
  const expected = armById.get(row.arm)?.systemPrompt;
  return expected !== undefined && row.system_prompt === expected && row.system_message_sent === Boolean(expected);
});

const checks = {
  successful_generation_count_450: generations.length === 450,
  successful_judgment_count_450: judgments.length === 450,
  unique_successful_generation_keys: generationsResult.duplicates.length === 0,
  unique_successful_judgment_keys: judgmentsResult.duplicates.length === 0,
  every_successful_generation_has_judgment: missingJudgments.length === 0,
  no_orphan_successful_judgments: orphanJudgments.length === 0,
  all_successful_judgments_have_valid_label: judgments.every((row) => LABELS.has(row.label)),
  expected_arm_sizes: JSON.stringify(countsBy(generations, "arm")) === JSON.stringify({ blank_system: 150, no_word_limit: 150, word_limit_30: 150 }),
  word_limit_compliance: generations.filter((row) => row.arm === "word_limit_30").every((row) => row.word_count <= 30 && row.word_limit_compliant === true),
  generation_response_ids_present_and_unique: generations.every((row) => row.response_id) && new Set(generations.map((row) => row.response_id)).size === generations.length,
  judge_response_ids_present_and_unique: judgments.every((row) => row.response_id) && new Set(judgments.map((row) => row.response_id)).size === judgments.length,
  no_fringe_assessment_has_30_topics: assessmentRows.length === 30,
  no_fringe_30_percent_set_matches_manifest: JSON.stringify(threshold30QuestionNumbers) === JSON.stringify(manifestThreshold30QuestionNumbers),
  raw_manifest_present: Boolean(rawManifest),
  exact_expected_task_keys: expectedKeys.size === 450 && expectedKeys.size === generationKeys.size && [...expectedKeys].every((key) => generationKeys.has(key)),
  prompts_and_endpoints_match_input_snapshot: promptAndEndpointMatches,
  system_messages_match_run_manifest: systemMatches,
  requested_generation_model_matches_manifest: generations.every((row) => row.requested_model === rawManifest?.generation_model),
  requested_judge_model_matches_manifest: judgments.every((row) => row.requested_model === rawManifest?.judge_model),
  judgment_generation_response_ids_match: judgments.every((row) => row.generation_response_id === generationsResult.byKey.get(row.key)?.response_id),
  judge_validation_input_set_has_180_rows: inputs.judge_validation_rows?.length === 180,
  ...(validationSummary ? {
    archived_judge_validation_has_180_rows: validationSummary.n === 180,
    archived_judge_validation_annotation_markers_stripped: validationSummary.annotation_markers_stripped_before_judging === true,
    archived_judge_validation_short_response_regime: Number(validationSummary.maximum_validation_response_words) <= 30,
  } : {}),
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  run_directory: portablePath(runDirectory),
  assessment_path: portablePath(assessmentPath),
  inputs_path: portablePath(inputsPath),
  validation_path: portablePath(validationPath),
  validation_summary_status: validationSummary ? "present" : "not_archived",
  checks,
  passed: Object.values(checks).filter(Boolean).length,
  total: Object.keys(checks).length,
  failed,
  records: {
    generations_total: generationRecords.length,
    generations_successful: generations.length,
    generation_failed_attempts_ignored: generationRecords.filter((row) => row.status !== "ok").length,
    judgments_total: judgmentRecords.length,
    judgments_successful: judgments.length,
    judgment_failed_attempts_ignored: judgmentRecords.filter((row) => row.status !== "ok").length,
  },
  duplicate_successful_generation_keys: generationsResult.duplicates,
  duplicate_successful_judgment_keys: judgmentsResult.duplicates,
  missing_judgments: missingJudgments,
  orphan_judgments: orphanJudgments,
  generations_by_arm: countsBy(generations, "arm"),
  judgments_by_label: countsBy(judgments, "label"),
  actual_generation_models: countsBy(generations, "actual_model"),
  actual_judge_models: countsBy(judgments, "actual_model"),
  no_fringe_30_percent_question_numbers: threshold30QuestionNumbers,
};

if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
