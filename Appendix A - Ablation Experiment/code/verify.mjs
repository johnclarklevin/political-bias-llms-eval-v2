#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJsonl(file) {
  return (await readFile(file, "utf8")).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

function latestSuccessfulByKey(rows) {
  const output = new Map();
  for (const row of rows) if (row.status === "ok") output.set(row.key, row);
  return output;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const inputs = JSON.parse(await readFile(path.join(ROOT, "inputs.json"), "utf8"));
const generationsRaw = await readJsonl(path.join(ROOT, "data", "raw", "generations.jsonl"));
const judgmentsRaw = await readJsonl(path.join(ROOT, "data", "raw", "judgments.jsonl"));
const fourLabelRaw = await readJsonl(path.join(ROOT, "data", "four-label", "judgments.jsonl"));
const generations = latestSuccessfulByKey(generationsRaw);
const judgments = latestSuccessfulByKey(judgmentsRaw);
const fourLabel = latestSuccessfulByKey(fourLabelRaw);

const expectedKeys = new Set();
for (const topic of inputs.topics) {
  for (const combination of inputs.combinations) {
    for (let repetition = 1; repetition <= 5; repetition += 1) {
      expectedKeys.add(`${topic.original_question_number}::${combination.id}::${repetition}`);
    }
  }
}

assert(expectedKeys.size === 1_600, `Expected 1,600 planned keys; found ${expectedKeys.size}.`);
for (const [label, records] of [["generation", generations], ["primary judgment", judgments], ["four-label judgment", fourLabel]]) {
  assert(records.size === expectedKeys.size, `${label}: ${records.size}/${expectedKeys.size} successful keys.`);
  assert([...expectedKeys].every((key) => records.has(key)), `${label}: at least one planned key is missing.`);
  assert([...records.keys()].every((key) => expectedKeys.has(key)), `${label}: at least one unexpected key is present.`);
}

const generationIds = new Set();
const primaryJudgeIds = new Set();
const fourLabelJudgeIds = new Set();
let promptMismatch = 0;
let judgmentLinkMismatch = 0;
let fourLabelLinkMismatch = 0;
let wordLimitNoncompliance = 0;
for (const key of expectedKeys) {
  const generation = generations.get(key);
  const judgment = judgments.get(key);
  const robustness = fourLabel.get(key);
  const combination = inputs.combinations.find((candidate) => candidate.id === generation.combination_id);
  assert(combination, `Unknown combination ${generation.combination_id} for ${key}.`);
  if (generation.system_prompt !== combination.system_prompt
    || JSON.stringify(generation.included_sentences) !== JSON.stringify(combination.included)) promptMismatch += 1;
  if (judgment.generation_response_id !== generation.response_id) judgmentLinkMismatch += 1;
  if (robustness.generation_response_id !== generation.response_id) fourLabelLinkMismatch += 1;
  if (combination.included[0] && generation.word_count > 30) wordLimitNoncompliance += 1;
  generationIds.add(generation.response_id);
  primaryJudgeIds.add(judgment.response_id);
  fourLabelJudgeIds.add(robustness.response_id);
}

assert(promptMismatch === 0, `${promptMismatch} generation records mismatch their planned prompt combination.`);
assert(judgmentLinkMismatch === 0, `${judgmentLinkMismatch} primary judgments link to the wrong generation.`);
assert(fourLabelLinkMismatch === 0, `${fourLabelLinkMismatch} four-label judgments link to the wrong generation.`);
assert(generationIds.size === expectedKeys.size, "Generation response IDs are not unique.");
assert(primaryJudgeIds.size === expectedKeys.size, "Primary judge response IDs are not unique.");
assert(fourLabelJudgeIds.size === expectedKeys.size, "Four-label judge response IDs are not unique.");

const verification = {
  status: "pass",
  checked_at: new Date().toISOString(),
  expected_keys: expectedKeys.size,
  successful_generation_keys: generations.size,
  successful_primary_judgment_keys: judgments.size,
  successful_four_label_judgment_keys: fourLabel.size,
  generation_error_rows: generationsRaw.filter((row) => row.status === "error").length,
  primary_judgment_error_rows: judgmentsRaw.filter((row) => row.status === "error").length,
  four_label_judgment_error_rows: fourLabelRaw.filter((row) => row.status === "error").length,
  unique_generation_response_ids: generationIds.size,
  unique_primary_judge_response_ids: primaryJudgeIds.size,
  unique_four_label_judge_response_ids: fourLabelJudgeIds.size,
  prompt_combination_mismatches: promptMismatch,
  primary_judgment_link_mismatches: judgmentLinkMismatch,
  four_label_judgment_link_mismatches: fourLabelLinkMismatch,
  word_limit_noncompliance: wordLimitNoncompliance,
  selected_original_question_numbers: inputs.topic_sampling.selected_question_numbers,
};

await mkdir(path.join(ROOT, "results"), { recursive: true });
await writeFile(path.join(ROOT, "results", "verification.json"), `${JSON.stringify(verification, null, 2)}\n`, "utf8");
console.log(JSON.stringify(verification, null, 2));
