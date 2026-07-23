#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const RAW = path.join(ROOT, "data", "raw");
const RESULTS = path.join(ROOT, "results");

async function readJsonl(file) {
  return (await readFile(file, "utf8")).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

function latestSuccessfulByKey(rows) {
  const output = new Map();
  for (const row of rows) if (row.status === "ok") output.set(row.key, row);
  return output;
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const inputsText = await readFile(path.join(ROOT, "inputs.json"), "utf8");
const inputs = JSON.parse(inputsText);
const manifest = JSON.parse(await readFile(path.join(RAW, "manifest.json"), "utf8"));
const generationRows = await readJsonl(path.join(RAW, "generations.jsonl"));
const primaryRows = await readJsonl(path.join(RAW, "primary-judgments.jsonl"));
const fourRows = await readJsonl(path.join(RAW, "four-label-judgments.jsonl"));
const generations = latestSuccessfulByKey(generationRows);
const primary = latestSuccessfulByKey(primaryRows);
const four = latestSuccessfulByKey(fourRows);

const expectedKeys = new Set(inputs.topics.flatMap((topic) =>
  inputs.backgrounds.flatMap((background) =>
    inputs.arms.map((arm) => `${topic.original_question_number}::${background.id}::${arm.id}`))));
const expectedByKey = new Map(inputs.topics.flatMap((topic) =>
  inputs.backgrounds.flatMap((background) =>
    inputs.arms.map((arm) => [
      `${topic.original_question_number}::${background.id}::${arm.id}`,
      { topic, background, arm },
    ]))));

const promptMismatches = [];
const keyMismatches = [];
for (const [key, generation] of generations) {
  const expected = expectedByKey.get(key);
  if (!expected) {
    keyMismatches.push(key);
    continue;
  }
  const expectedPrompt = [expected.background.system_prompt_prefix, expected.arm.text]
    .filter(Boolean).join(" ");
  if (generation.system_prompt !== expectedPrompt
      || generation.prompt !== expected.topic.prompt
      || generation.arm_id !== expected.arm.id
      || generation.background_id !== expected.background.id) {
    promptMismatches.push(key);
  }
}

const uniqueGenerationIds = new Set([...generations.values()].map((row) => row.response_id));
const uniquePrimaryIds = new Set([...primary.values()].map((row) => row.response_id));
const uniqueFourIds = new Set([...four.values()].map((row) => row.response_id));
const primaryLinkMismatches = [...primary.values()].filter((row) =>
  generations.get(row.key)?.response_id !== row.generation_response_id).map((row) => row.key);
const fourLinkMismatches = [...four.values()].filter((row) =>
  generations.get(row.key)?.response_id !== row.generation_response_id).map((row) => row.key);

const blockCounts = new Map();
for (const row of generations.values()) {
  const block = `${row.original_question_number}::${row.background_id}`;
  blockCounts.set(block, (blockCounts.get(block) ?? 0) + 1);
}
const invalidBlocks = [...blockCounts].filter(([, count]) => count !== 5);
const generationErrors = generationRows.filter((row) => row.status !== "ok");
const primaryErrors = primaryRows.filter((row) => row.status !== "ok");
const fourErrors = fourRows.filter((row) => row.status !== "ok");

const checks = {
  expected_design_keys: expectedKeys.size === 1_520,
  successful_generation_keys_complete: generations.size === expectedKeys.size
    && [...expectedKeys].every((key) => generations.has(key)),
  successful_primary_keys_complete: primary.size === expectedKeys.size
    && [...expectedKeys].every((key) => primary.has(key)),
  successful_four_label_keys_complete: four.size === expectedKeys.size
    && [...expectedKeys].every((key) => four.has(key)),
  prompt_construction_exact: promptMismatches.length === 0,
  no_unexpected_generation_keys: keyMismatches.length === 0,
  blocks_balanced: blockCounts.size === 19 * 16 && invalidBlocks.length === 0,
  generation_ids_unique: uniqueGenerationIds.size === generations.size,
  primary_judge_ids_unique: uniquePrimaryIds.size === primary.size,
  four_label_judge_ids_unique: uniqueFourIds.size === four.size,
  primary_links_exact: primaryLinkMismatches.length === 0,
  four_label_links_exact: fourLinkMismatches.length === 0,
  manifest_counts_match: manifest.planned_generations === expectedKeys.size
    && manifest.topics === 19 && manifest.backgrounds === 16,
};
const passed = Object.values(checks).every(Boolean);
const verification = {
  verified_at: new Date().toISOString(),
  passed,
  checks,
  counts: {
    expected_keys: expectedKeys.size,
    generation_records_total: generationRows.length,
    successful_generations: generations.size,
    primary_records_total: primaryRows.length,
    successful_primary_judgments: primary.size,
    four_label_records_total: fourRows.length,
    successful_four_label_judgments: four.size,
    generation_error_attempts_retained: generationErrors.length,
    primary_error_attempts_retained: primaryErrors.length,
    four_label_error_attempts_retained: fourErrors.length,
  },
  model_snapshots: {
    generation: [...new Set([...generations.values()].map((row) => row.actual_model))],
    primary_judge: [...new Set([...primary.values()].map((row) => row.actual_model))],
    four_label_judge: [...new Set([...four.values()].map((row) => row.actual_model))],
  },
  diagnostics: {
    unexpected_generation_keys: keyMismatches,
    prompt_mismatches: promptMismatches,
    invalid_blocks: invalidBlocks,
    primary_link_mismatches: primaryLinkMismatches,
    four_label_link_mismatches: fourLinkMismatches,
  },
  inputs_sha256: sha256(inputsText),
};

await writeFile(path.join(RESULTS, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`, "utf8");
console.log(JSON.stringify(verification, null, 2));
if (!passed) process.exitCode = 2;
