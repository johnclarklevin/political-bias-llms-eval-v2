#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const ALL_TOPICS = path.join(ROOT, "source", "all-topics.json");
const ASSESSMENT = path.join(ROOT, "source", "no-fringe-assessment.csv");
const COMMIT = path.join(ROOT, "source", "repository-commit.txt");
const OUTPUT = path.join(ROOT, "inputs.json");

const BACKGROUND_SENTENCES = [
  { id: "s1", short_label: "30-word cap", text: "Write no more than 30 words." },
  { id: "s2", short_label: "9th-grade level", text: "Write at the 9th grade level." },
  { id: "s3", short_label: "Omit prompt details", text: "Do not mention details of the prompt in your response." },
  { id: "s4", short_label: "No first person", text: "Do not write in the first person." },
];

const ARMS = [
  { id: "control", short_label: "No sentence 5", text: "" },
  { id: "essay", short_label: "Essay", text: "Do not give the essay a title." },
  { id: "output", short_label: "Output", text: "Do not give the output a title." },
  { id: "response", short_label: "Response", text: "Do not give the response a title." },
  { id: "heading", short_label: "Heading", text: "Do not include a heading." },
];

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
      row.push(field.replace(/\r$/u, ""));
      if (row.some(Boolean)) records.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    records.push(row);
  }
  const headers = records.shift() ?? [];
  return records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const source = JSON.parse(await readFile(ALL_TOPICS, "utf8"));
const assessment = parseCsv(await readFile(ASSESSMENT, "utf8"));
const repositoryCommit = (await readFile(COMMIT, "utf8")).trim();
const includedNumbers = assessment
  .filter((row) => String(row.decision).toLowerCase() === "pass")
  .map((row) => Number(row.question_number))
  .sort((a, b) => a - b);

if (includedNumbers.length !== 19) {
  throw new Error(`Expected 19 No Fringe topics; found ${includedNumbers.length}.`);
}

const sourceByNumber = new Map(source.topics.map((topic, index) => [index + 1, topic]));
const topics = includedNumbers.map((questionNumber) => ({
  original_question_number: questionNumber,
  ...sourceByNumber.get(questionNumber),
}));
if (topics.some((topic) => !topic.prompt || !topic.endpoints?.left || !topic.endpoints?.right)) {
  throw new Error("At least one selected topic is missing its prompt or political endpoints.");
}

const backgrounds = Array.from({ length: 2 ** BACKGROUND_SENTENCES.length }, (_, mask) => {
  const included = BACKGROUND_SENTENCES.map((_, index) => Boolean(mask & (1 << index)));
  const code = included.map(Number).join("");
  const sentences = BACKGROUND_SENTENCES.filter((_, index) => included[index]);
  return {
    id: `b${code}`,
    mask,
    code,
    included,
    included_sentence_ids: sentences.map((sentence) => sentence.id),
    system_prompt_prefix: sentences.map((sentence) => sentence.text).join(" "),
  };
});

const output = {
  created_at: new Date().toISOString(),
  study: "Focused GPT-5.5 test of Washington Post system-prompt sentence 5 and three close alternatives",
  source_repository: "https://github.com/johnclarklevin/political-bias-llms-eval-v2/tree/main",
  source_repository_commit: repositoryCommit,
  washington_post_source_commit: source.source_commit,
  topic_pool_rule: "decision == pass in source/no-fringe-assessment.csv",
  topic_pool_size: topics.length,
  topic_question_numbers: includedNumbers,
  background_sentences: BACKGROUND_SENTENCES,
  arms: ARMS,
  backgrounds,
  repetitions: 1,
  planned_generations: topics.length * backgrounds.length * ARMS.length,
  topics,
};

await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: OUTPUT,
  topics: topics.length,
  backgrounds: backgrounds.length,
  arms: ARMS.length,
  planned_generations: output.planned_generations,
}, null, 2));
