#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// Runs the 180-row judge validation: Claude Fable 5 classifies human-labeled
// responses whose [d:...] and [r:...] annotation markers are stripped before
// the judge sees them. Compares predictions with human labels.

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMessage, judgeRequestBody, readJsonl, visibleText, normalizeUsage } from "./replicate.mjs";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(CODE_DIR, "..");
const LABELS = new Set(["left", "right", "both"]);

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

function parseEnv(text) {
  const output = {};
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    output[line.slice(0, separator).trim()] = value;
  }
  return output;
}

// Strip [d:...] and [r:...] human-annotation markers, keeping enclosed text.
export function stripMarkers(text) {
  return text.replace(/\[(?:d|r):((?:[^\[\]]|\[[^\]]*\])*)\]/g, "$1");
}

async function mapLimit(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

const options = parseArgs(process.argv.slice(2));
const inputsPath = path.resolve(options.inputs ?? path.join(REPOSITORY_ROOT, "config", "inputs.json"));
const outputDirectory = path.resolve(options.output ?? path.join(REPOSITORY_ROOT, "data", "judge-validation"));
const judgeModel = options["judge-model"] ?? "claude-fable-5";
const judgeEffort = options["judge-effort"] ?? "medium";
const judgeMaxTokens = Number(options["judge-max-tokens"] ?? 4096);
const concurrency = Number(options.concurrency ?? 5);
const envPath = path.resolve(options.env ?? path.join(REPOSITORY_ROOT, ".env"));

let apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  try {
    apiKey = parseEnv(await readFile(envPath, "utf8")).ANTHROPIC_API_KEY;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set and was not found in .env");

const inputs = JSON.parse(await readFile(inputsPath, "utf8"));
const topicEndpoints = new Map(inputs.topics.map((topic) => [topic.topic, topic.endpoints]));
const rows = inputs.judge_validation_rows;
if (!Array.isArray(rows) || rows.length === 0) throw new Error("No judge_validation_rows in inputs");

await mkdir(outputDirectory, { recursive: true });
const resultsPath = path.join(outputDirectory, "results.jsonl");
const existing = await readJsonl(resultsPath);
const doneIds = new Set(existing.filter((row) => row.status === "ok").map((row) => row.id));
const pending = rows.filter((row) => !doneIds.has(row.id));
console.log(`Judge validation: ${pending.length} pending of ${rows.length}`);

let chain = Promise.resolve();
const append = (record) => {
  chain = chain.then(() => appendFile(resultsPath, `${JSON.stringify(record)}\n`, "utf8"));
  return chain;
};

let completed = 0;
await mapLimit(pending, concurrency, async (row) => {
  const endpoints = topicEndpoints.get(row.topic);
  if (!endpoints) throw new Error(`Unknown topic in validation rows: ${row.topic}`);
  const cleanResponse = stripMarkers(row.response);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const started = Date.now();
    let record;
    try {
      const response = await createMessage(
        apiKey,
        judgeRequestBody({
          model: judgeModel,
          effort: judgeEffort,
          maxTokens: judgeMaxTokens,
          generation: { prompt: row.prompt, endpoints, response: cleanResponse },
        }),
      );
      const raw = visibleText(response);
      const normalized = raw.trim().toLowerCase();
      const firstToken = normalized.split(/\s+/)[0] ?? "";
      const valid = LABELS.has(firstToken) && response.stop_reason !== "max_tokens" && normalized.length > 0;
      record = {
        status: valid ? "ok" : "invalid",
        id: row.id,
        topic: row.topic,
        human_label: row.human_label,
        predicted_label: valid ? firstToken : null,
        raw_judge_response: raw,
        raw_answer_is_exact_label: LABELS.has(normalized),
        requested_model: judgeModel,
        actual_model: response.model,
        response_id: response.id,
        stop_reason: response.stop_reason,
        attempt,
        usage: normalizeUsage(response.usage),
        elapsed_ms: Date.now() - started,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      record = {
        status: "error",
        id: row.id,
        topic: row.topic,
        human_label: row.human_label,
        attempt,
        error: error.message,
        elapsed_ms: Date.now() - started,
        created_at: new Date().toISOString(),
      };
    }
    await append(record);
    if (record.status === "ok") break;
  }
  completed += 1;
  if (completed % 20 === 0 || completed === pending.length) console.log(`Validation progress: ${completed}/${pending.length}`);
});

// Summarize.
const all = await readJsonl(resultsPath);
const best = new Map();
for (const record of all) {
  const previous = best.get(record.id);
  if (!previous || (previous.status !== "ok" && record.status === "ok")) best.set(record.id, record);
}
const finalRecords = rows.map((row) => best.get(row.id)).filter(Boolean);
const okRecords = finalRecords.filter((row) => row.status === "ok");
const invalid = finalRecords.length - okRecords.length;
const labels = ["left", "right", "both"];
const confusion = Object.fromEntries(
  labels.map((actual) => [
    actual,
    Object.fromEntries([...labels, "invalid"].map((predicted) => [predicted, 0])),
  ]),
);
for (const record of finalRecords) {
  const predicted = record.status === "ok" ? record.predicted_label : "invalid";
  confusion[record.human_label][predicted] += 1;
}
const correct = okRecords.filter((row) => row.predicted_label === row.human_label).length;
const perLabel = Object.fromEntries(
  labels.map((label) => {
    const support = finalRecords.filter((row) => row.human_label === label).length;
    const truePositive = confusion[label][label];
    const predictedTotal = labels.reduce((sum, actual) => sum + confusion[actual][label], 0);
    return [
      label,
      {
        support,
        precision: predictedTotal ? truePositive / predictedTotal : null,
        recall: support ? truePositive / support : null,
      },
    ];
  }),
);
const nonExact = okRecords.filter((row) => row.raw_answer_is_exact_label === false).length;
const summary = {
  generated_at: new Date().toISOString(),
  judge_model: judgeModel,
  judge_effort: judgeEffort,
  n: finalRecords.length,
  accuracy: finalRecords.length ? correct / finalRecords.length : null,
  invalid,
  raw_answers_not_exact_single_label: nonExact,
  confusion_matrix_actual_by_predicted: confusion,
  per_label: perLabel,
  note: "Fable 5 and Opus 4.8 share a model provider (Anthropic); agreement with human labels does not rule out same-family scoring effects.",
};
await writeFile(path.join(outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
