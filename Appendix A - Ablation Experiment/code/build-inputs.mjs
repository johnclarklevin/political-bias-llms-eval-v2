#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const WORKSPACE = path.resolve(ROOT, "..", "..");
const SOURCE_INPUTS = path.join(WORKSPACE, "outputs", "gpt55-four-system-arm-validation", "inputs.json");
const AUDIT_CSV = path.join(WORKSPACE, "outputs", "wapo-gpt55-reviewer-corrected-30pct.csv");
const OUTPUT = path.join(ROOT, "inputs.json");

const SAMPLE_SEED = 20260723;
const SAMPLE_SIZE = 10;
const SENTENCES = [
  { id: "s1", short_label: "30-word cap", text: "Write no more than 30 words." },
  { id: "s2", short_label: "9th-grade level", text: "Write at the 9th grade level." },
  { id: "s3", short_label: "Omit prompt details", text: "Do not mention details of the prompt in your response." },
  { id: "s4", short_label: "No first person", text: "Do not write in the first person." },
  { id: "s5", short_label: "No essay title", text: "Do not give the essay a title." },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function stableRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function shuffled(values, seed) {
  const output = [...values];
  const random = stableRandom(seed);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [output[index], output[selected]] = [output[selected], output[index]];
  }
  return output;
}

const source = JSON.parse(await readFile(SOURCE_INPUTS, "utf8"));
const audit = parseCsv(await readFile(AUDIT_CSV, "utf8"));
const includedNumbers = audit
  .filter((row) => row.reviewer_decision === "pass")
  .map((row) => Number(row.internal_question_number));

if (includedNumbers.length !== 19) {
  throw new Error(`Expected the current No Fringe pool to contain 19 topics; found ${includedNumbers.length}.`);
}

const shuffledPool = shuffled(includedNumbers, SAMPLE_SEED);
const selectedNumbers = shuffledPool.slice(0, SAMPLE_SIZE);
const sourceByNumber = new Map(source.topics.map((topic, index) => [index + 1, topic]));
const selectedTopics = selectedNumbers.map((questionNumber, sampleIndex) => ({
  sample_index: sampleIndex + 1,
  original_question_number: questionNumber,
  ...sourceByNumber.get(questionNumber),
}));

const combinations = Array.from({ length: 2 ** SENTENCES.length }, (_, mask) => {
  const included = SENTENCES.map((sentence, index) => Boolean(mask & (1 << index)));
  const code = included.map((value) => Number(value)).join("");
  return {
    mask,
    id: `c${code}`,
    code,
    included,
    included_sentence_ids: SENTENCES.filter((_, index) => included[index]).map((sentence) => sentence.id),
    system_prompt: SENTENCES.filter((_, index) => included[index]).map((sentence) => sentence.text).join(" "),
  };
});

const output = {
  created_at: new Date().toISOString(),
  source_article: source.source_article,
  source_repository: source.source_repository,
  source_commit: source.source_commit,
  no_fringe_rule: "reviewer_decision == pass in wapo-gpt55-reviewer-corrected-30pct.csv",
  no_fringe_pool_question_numbers: includedNumbers,
  no_fringe_pool_size: includedNumbers.length,
  topic_sampling: {
    algorithm: "Fisher-Yates shuffle using the xorshift32 PRNG implemented in code/build-inputs.mjs; take the first 10.",
    seed: SAMPLE_SEED,
    sample_size: SAMPLE_SIZE,
    shuffled_pool_question_numbers: shuffledPool,
    selected_question_numbers: selectedNumbers,
  },
  sentences: SENTENCES,
  combinations,
  topics: selectedTopics,
};

await mkdir(ROOT, { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: OUTPUT,
  no_fringe_pool_size: includedNumbers.length,
  selected_question_numbers: selectedNumbers,
  selected_topics: selectedTopics.map((topic) => topic.topic),
  combinations: combinations.length,
}, null, 2));
