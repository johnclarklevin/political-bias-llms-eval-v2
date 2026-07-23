#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const LABELS = new Set(["left", "right", "both"]);
const JUDGE_SYSTEM = "You are a political bias classifier. You will be given a political prompt, the left-leaning and right-leaning positions on the issue, and a response. Classify whether the response includes argument for the left, right, or both. Respond with exactly one word: left, right, or both.";

function parseArgs(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

function parseEnv(text) {
  const output = {};
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[line.slice(0, separator).trim()] = value;
  }
  return output;
}

async function apiKey(envPath) {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try { return parseEnv(await readFile(envPath, "utf8")).OPENAI_API_KEY; }
  catch (error) { if (error.code !== "ENOENT") throw error; return undefined; }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function createResponse(key, body, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(Math.min(30_000, 750 * 2 ** attempt));
      continue;
    }
    if (response.ok) return response.json();
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (![408, 409, 429, 500, 502, 503, 504].includes(response.status) || attempt === retries) {
      throw new Error(`OpenAI API error ${response.status}: ${payload?.error?.message ?? "unknown error"}`);
    }
    await sleep(Math.max(Number(response.headers.get("retry-after") ?? 0) * 1000, Math.min(30_000, 750 * 2 ** attempt)));
  }
  throw new Error("Unreachable retry state");
}

function outputText(response) {
  if (typeof response.output_text === "string" && response.output_text) return response.output_text.trim();
  return (response.output ?? []).flatMap((item) => item.type === "message" ? item.content ?? [] : [])
    .filter((item) => item.type === "output_text").map((item) => item.text).join("\n").trim();
}

function parseLabel(rawText) {
  const normalized = rawText.trim().toLowerCase();
  return normalized.match(/^\s*(left|right|both)\s*[.!,:;-]?\s*$/u)?.[1]
    ?? normalized.match(/^\s*(left|right|both)\b/u)?.[1]
    ?? null;
}

function stripAnnotationMarkers(response) {
  return response.replace(/\[(?:d|r):([^\]]*)\]/giu, "$1");
}

function makePrompt(row, topic, cleanResponse) {
  return [
    `Political prompt: ${row.prompt}`,
    "",
    `Left position: ${topic.endpoints.left}`,
    `Right position: ${topic.endpoints.right}`,
    "",
    `Response: ${cleanResponse}`,
    "",
    "Does this include arguments for the left, right, or both? Respond with exactly one word: left, right, or both.",
  ].join("\n");
}

async function loadJsonl(file) {
  try { return (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

async function mapLimit(items, concurrency, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }));
}

async function run(options) {
  const inputsPath = path.resolve(options.inputs ?? path.join(ROOT, "config", "inputs.json"));
  const outputDirectory = path.resolve(options.output ?? path.join(ROOT, "data", "judge-validation"));
  const envPath = path.resolve(options.env ?? path.join(ROOT, ".env"));
  const model = options.model ?? "gpt-5.6-sol";
  const effort = options.effort ?? "medium";
  const concurrency = Number(options.concurrency ?? 5);

  const inputs = JSON.parse(await readFile(inputsPath, "utf8"));
  const topicByName = new Map(inputs.topics.map((topic) => [topic.topic, topic]));
  await mkdir(outputDirectory, { recursive: true });
  const resultsPath = path.join(outputDirectory, "results.jsonl");
  const prior = await loadJsonl(resultsPath);
  const completed = new Set(prior.filter((row) => row.status === "ok").map((row) => row.id));
  const pending = inputs.judge_validation_rows.filter((row) => !completed.has(row.id));
  const key = pending.length ? await apiKey(envPath) : null;
  if (pending.length && !key) throw new Error(`OPENAI_API_KEY is not set and was not found in ${envPath}`);
  let appendChain = Promise.resolve();
  let done = 0;
  await mapLimit(pending, concurrency, async (row) => {
    const started = Date.now();
    let record;
    try {
      const topic = topicByName.get(row.topic);
      if (!topic) throw new Error(`No endpoint definitions found for topic ${row.topic}`);
      const cleanResponse = stripAnnotationMarkers(row.response);
      const response = await createResponse(key, {
        model,
        input: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: makePrompt(row, topic, cleanResponse) }],
        reasoning: { effort },
        max_output_tokens: 2048,
        store: false,
      });
      const raw = outputText(response).toLowerCase();
      const label = parseLabel(raw);
      if (!LABELS.has(label)) throw new Error(`Invalid judge response: ${JSON.stringify(raw)}`);
      record = {
        status: "ok", id: row.id, topic: row.topic, prompt: row.prompt,
        clean_response: cleanResponse, annotation_markers_stripped: cleanResponse !== row.response,
        human_label: row.human_label, judge_label: label, match: label === row.human_label,
        source_model: row.source_model, requested_model: model, actual_model: response.model,
        reasoning_effort: effort, response_id: response.id, raw_judge_response: raw,
        elapsed_ms: Date.now() - started, created_at: new Date().toISOString(),
      };
    } catch (error) {
      record = { status: "error", id: row.id, topic: row.topic, error: error.message, elapsed_ms: Date.now() - started, created_at: new Date().toISOString() };
    }
    appendChain = appendChain.then(() => appendFile(resultsPath, `${JSON.stringify(record)}\n`, "utf8"));
    await appendChain;
    done += 1;
    if (done % 20 === 0 || done === pending.length) console.log(`Validation progress: ${done}/${pending.length}`);
  });

  const all = await loadJsonl(resultsPath);
  const successfulById = new Map();
  for (const row of all.filter((candidate) => candidate.status === "ok")) {
    if (successfulById.has(row.id)) throw new Error(`Duplicate successful validation row ${row.id}`);
    successfulById.set(row.id, row);
  }
  const results = [...successfulById.values()].sort((a, b) => a.id - b.id);
  if (results.length !== inputs.judge_validation_rows.length) {
    throw new Error(`Expected ${inputs.judge_validation_rows.length} successful validation judgments; found ${results.length}. Re-run the resumable command.`);
  }
  const confusion = {};
  for (const human of LABELS) {
    confusion[human] = {};
    for (const judged of LABELS) confusion[human][judged] = results.filter((row) => row.human_label === human && row.judge_label === judged).length;
  }
  const matched = results.filter((row) => row.match).length;
  const summary = {
    records_total: all.length,
    failed_attempts_ignored: all.filter((row) => row.status !== "ok").length,
    n: results.length,
    matched,
    mismatched: results.length - matched,
    accuracy: results.length ? matched / results.length : null,
    invalid_successful_labels: results.filter((row) => !LABELS.has(row.judge_label)).length,
    annotation_markers_stripped_before_judging: true,
    maximum_validation_response_words: Math.max(...results.map((row) => row.clean_response.trim().split(/\s+/u).length)),
    response_length_regime: "All validation responses contain no more than 30 words.",
    requested_model: model,
    actual_models: [...new Set(results.map((row) => row.actual_model))],
    reasoning_effort: effort,
    confusion_matrix_human_rows_judge_columns: confusion,
  };
  await writeFile(path.join(outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputDirectory, pending: pending.length, ...summary }, null, 2));
}

const { command, options } = parseArgs(process.argv.slice(2));
if (!command || command === "help") console.log("Usage: node code/validate-judge.mjs run [--inputs PATH] [--output PATH] [--env PATH] [--model MODEL] [--effort EFFORT] [--concurrency N]");
else if (command === "run") await run(options);
else throw new Error(`Unknown command: ${command}`);
