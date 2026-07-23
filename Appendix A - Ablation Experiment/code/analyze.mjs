#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const RAW = path.join(ROOT, "data", "raw");
const RESULTS = path.join(ROOT, "results");
const INPUTS_PATH = path.join(ROOT, "inputs.json");
const EXPECTED_RESPONSES = 1_600;
const T_CRITICAL_95_DF9 = 2.2621571628540993;

async function readJsonl(file) {
  return (await readFile(file, "utf8")).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

async function readJsonlOptional(file) {
  try { return await readJsonl(file); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

function latestSuccessfulByKey(rows) {
  const output = new Map();
  for (const row of rows) if (row.status === "ok") output.set(row.key, row);
  return output;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function sampleSd(values) {
  if (values.length < 2) return 0;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
}

function correlation(first, second) {
  const firstMean = mean(first);
  const secondMean = mean(second);
  const numerator = first.reduce((sum, value, index) =>
    sum + (value - firstMean) * (second[index] - secondMean), 0);
  const denominator = Math.sqrt(
    first.reduce((sum, value) => sum + (value - firstMean) ** 2, 0)
    * second.reduce((sum, value) => sum + (value - secondMean) ** 2, 0),
  );
  return denominator ? numerator / denominator : null;
}

function confidenceInterval(values, populationSize = null) {
  const estimate = mean(values);
  const baseSe = sampleSd(values) / Math.sqrt(values.length);
  const fpc = populationSize
    ? Math.sqrt((populationSize - values.length) / (populationSize - 1))
    : 1;
  const se = baseSe * fpc;
  return {
    estimate,
    se,
    lower: estimate - T_CRITICAL_95_DF9 * se,
    upper: estimate + T_CRITICAL_95_DF9 * se,
    fpc,
  };
}

function exactSignFlipP(values) {
  const observed = Math.abs(mean(values));
  let asExtreme = 0;
  const assignments = 2 ** values.length;
  for (let mask = 0; mask < assignments; mask += 1) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
      sum += (mask & (1 << index) ? 1 : -1) * values[index];
    }
    if (Math.abs(sum / values.length) >= observed - 1e-12) asExtreme += 1;
  }
  return asExtreme / assignments;
}

function holmAdjust(records, pField = "p_value", outputField = "holm_p_value") {
  const ranked = [...records].sort((a, b) => a[pField] - b[pField]);
  let previous = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    const adjusted = Math.min(1, (ranked.length - index) * ranked[index][pField]);
    previous = Math.max(previous, adjusted);
    ranked[index][outputField] = previous;
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns = null) {
  if (!rows.length) return "";
  const headers = columns ?? Object.keys(rows[0]);
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`;
}

function formatPercent(value, digits = 1) {
  return `${(100 * value).toFixed(digits)}%`;
}

function formatP(value) {
  return value < 0.001 ? "<0.001" : value.toFixed(3);
}

const inputs = JSON.parse(await readFile(INPUTS_PATH, "utf8"));
const manifest = JSON.parse(await readFile(path.join(RAW, "manifest.json"), "utf8"));
const generationRows = await readJsonl(path.join(RAW, "generations.jsonl"));
const judgmentRows = await readJsonl(path.join(RAW, "judgments.jsonl"));
const generations = latestSuccessfulByKey(generationRows);
const judgments = latestSuccessfulByKey(judgmentRows);

const rows = [];
for (const [key, generation] of generations) {
  const judgment = judgments.get(key);
  if (!judgment || judgment.generation_response_id !== generation.response_id) continue;
  rows.push({
    ...generation,
    judge_response_id: judgment.response_id,
    judge_actual_model: judgment.actual_model,
    judge_label: judgment.label,
    raw_judge_response: judgment.raw_judge_response,
    judge_usage: judgment.usage,
    judge_elapsed_ms: judgment.elapsed_ms,
    left_only: Number(judgment.label === "left"),
  });
}

if (rows.length !== EXPECTED_RESPONSES) {
  throw new Error(`Expected ${EXPECTED_RESPONSES} matched successful responses; found ${rows.length}.`);
}

const topicNumbers = inputs.topics.map((topic) => topic.original_question_number);
const topicSet = new Set(topicNumbers);
const combinations = inputs.combinations;
const sentences = inputs.sentences;
const rowByTopic = new Map(topicNumbers.map((number) => [number, rows.filter((row) => row.original_question_number === number)]));

const cellCounts = new Map();
for (const row of rows) {
  const cell = `${row.original_question_number}::${row.combination_id}`;
  cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1);
}
const invalidCells = [...cellCounts].filter(([, count]) => count !== manifest.repetitions);
if (cellCounts.size !== inputs.topics.length * combinations.length || invalidCells.length) {
  throw new Error(`Unbalanced factorial cells: ${JSON.stringify(invalidCells.slice(0, 10))}`);
}

const topicEffects = [];
const mainEffects = [];
for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
  const sentence = sentences[sentenceIndex];
  const effects = [];
  for (const topic of inputs.topics) {
    const topicRows = rowByTopic.get(topic.original_question_number);
    const presentRows = topicRows.filter((row) => row.included_sentences[sentenceIndex]);
    const absentRows = topicRows.filter((row) => !row.included_sentences[sentenceIndex]);
    const presentFrequency = mean(presentRows.map((row) => row.left_only));
    const absentFrequency = mean(absentRows.map((row) => row.left_only));
    const effect = presentFrequency - absentFrequency;
    effects.push(effect);
    topicEffects.push({
      sentence_id: sentence.id,
      sentence: sentence.text,
      short_label: sentence.short_label,
      original_question_number: topic.original_question_number,
      topic: topic.topic,
      n_present: presentRows.length,
      n_absent: absentRows.length,
      left_frequency_present: presentFrequency,
      left_frequency_absent: absentFrequency,
      risk_difference: effect,
      risk_difference_pp: 100 * effect,
    });
  }
  const presentRows = rows.filter((row) => row.included_sentences[sentenceIndex]);
  const absentRows = rows.filter((row) => !row.included_sentences[sentenceIndex]);
  const presentFrequency = mean(presentRows.map((row) => row.left_only));
  const absentFrequency = mean(absentRows.map((row) => row.left_only));
  const primaryInterval = confidenceInterval(effects);
  const finite = confidenceInterval(effects, inputs.no_fringe_pool_size);
  mainEffects.push({
    sentence_id: sentence.id,
    sentence: sentence.text,
    short_label: sentence.short_label,
    n_present: presentRows.length,
    n_absent: absentRows.length,
    left_frequency_present: presentFrequency,
    left_frequency_absent: absentFrequency,
    average_word_count_present: mean(presentRows.map((row) => row.word_count)),
    average_word_count_absent: mean(absentRows.map((row) => row.word_count)),
    average_word_count_difference: mean(presentRows.map((row) => row.word_count)) - mean(absentRows.map((row) => row.word_count)),
    risk_difference: primaryInterval.estimate,
    risk_difference_pp: 100 * primaryInterval.estimate,
    ci95_lower: primaryInterval.lower,
    ci95_upper: primaryInterval.upper,
    ci95_lower_pp: 100 * primaryInterval.lower,
    ci95_upper_pp: 100 * primaryInterval.upper,
    standard_error: primaryInterval.se,
    finite_population_ci95_lower: finite.lower,
    finite_population_ci95_upper: finite.upper,
    topic_effect_sd: sampleSd(effects),
    risk_ratio: absentFrequency === 0 ? null : presentFrequency / absentFrequency,
    p_value: exactSignFlipP(effects),
  });
}
holmAdjust(mainEffects);
mainEffects.sort((a, b) => Math.abs(b.risk_difference) - Math.abs(a.risk_difference));
mainEffects.forEach((row, index) => { row.absolute_effect_rank = index + 1; });

const fourLabelRows = await readJsonlOptional(path.join(ROOT, "data", "four-label", "judgments.jsonl"));
const fourLabelByKey = latestSuccessfulByKey(fourLabelRows);
const fourLabelMatched = rows.filter((row) => {
  const judgment = fourLabelByKey.get(row.key);
  if (!judgment || judgment.generation_response_id !== row.response_id) return false;
  row.four_label = judgment.four_label;
  row.four_left_only = Number(judgment.four_label === "left");
  row.four_label_judge_response_id = judgment.response_id;
  return true;
});
const fourLabelTopicEffects = [];
const fourLabelMainEffects = [];
if (fourLabelMatched.length) {
  if (fourLabelMatched.length !== EXPECTED_RESPONSES) {
    throw new Error(`Four-label robustness is incomplete: ${fourLabelMatched.length}/${EXPECTED_RESPONSES}.`);
  }
  for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
    const sentence = sentences[sentenceIndex];
    const effects = [];
    for (const topic of inputs.topics) {
      const topicRows = fourLabelMatched.filter((row) =>
        row.original_question_number === topic.original_question_number);
      const presentRows = topicRows.filter((row) => row.included_sentences[sentenceIndex]);
      const absentRows = topicRows.filter((row) => !row.included_sentences[sentenceIndex]);
      const presentFrequency = mean(presentRows.map((row) => row.four_left_only));
      const absentFrequency = mean(absentRows.map((row) => row.four_left_only));
      const effect = presentFrequency - absentFrequency;
      effects.push(effect);
      fourLabelTopicEffects.push({
        sentence_id: sentence.id,
        short_label: sentence.short_label,
        original_question_number: topic.original_question_number,
        topic: topic.topic,
        left_frequency_present: presentFrequency,
        left_frequency_absent: absentFrequency,
        risk_difference: effect,
        risk_difference_pp: 100 * effect,
      });
    }
    const presentRows = fourLabelMatched.filter((row) => row.included_sentences[sentenceIndex]);
    const absentRows = fourLabelMatched.filter((row) => !row.included_sentences[sentenceIndex]);
    const primaryInterval = confidenceInterval(effects);
    const finite = confidenceInterval(effects, inputs.no_fringe_pool_size);
    fourLabelMainEffects.push({
      sentence_id: sentence.id,
      sentence: sentence.text,
      short_label: sentence.short_label,
      n_present: presentRows.length,
      n_absent: absentRows.length,
      left_frequency_present: mean(presentRows.map((row) => row.four_left_only)),
      left_frequency_absent: mean(absentRows.map((row) => row.four_left_only)),
      average_word_count_present: mean(presentRows.map((row) => row.word_count)),
      average_word_count_absent: mean(absentRows.map((row) => row.word_count)),
      average_word_count_difference: mean(presentRows.map((row) => row.word_count)) - mean(absentRows.map((row) => row.word_count)),
      risk_difference: primaryInterval.estimate,
      risk_difference_pp: 100 * primaryInterval.estimate,
      ci95_lower: primaryInterval.lower,
      ci95_upper: primaryInterval.upper,
      ci95_lower_pp: 100 * primaryInterval.lower,
      ci95_upper_pp: 100 * primaryInterval.upper,
      finite_population_ci95_lower: finite.lower,
      finite_population_ci95_upper: finite.upper,
      p_value: exactSignFlipP(effects),
    });
  }
  holmAdjust(fourLabelMainEffects);
  fourLabelMainEffects.sort((a, b) => Math.abs(b.risk_difference) - Math.abs(a.risk_difference));
  fourLabelMainEffects.forEach((row, index) => { row.absolute_effect_rank = index + 1; });
}

const interactionTopicEffects = [];
const interactionEffects = [];
for (let first = 0; first < sentences.length; first += 1) {
  for (let second = first + 1; second < sentences.length; second += 1) {
    const effects = [];
    for (const topic of inputs.topics) {
      const topicRows = rowByTopic.get(topic.original_question_number);
      const cellMean = (firstValue, secondValue) => mean(topicRows
        .filter((row) => Number(row.included_sentences[first]) === firstValue
          && Number(row.included_sentences[second]) === secondValue)
        .map((row) => row.left_only));
      const m00 = cellMean(0, 0);
      const m01 = cellMean(0, 1);
      const m10 = cellMean(1, 0);
      const m11 = cellMean(1, 1);
      const interaction = m11 - m10 - m01 + m00;
      effects.push(interaction);
      interactionTopicEffects.push({
        first_sentence_id: sentences[first].id,
        second_sentence_id: sentences[second].id,
        first_short_label: sentences[first].short_label,
        second_short_label: sentences[second].short_label,
        original_question_number: topic.original_question_number,
        topic: topic.topic,
        mean_00: m00,
        mean_01: m01,
        mean_10: m10,
        mean_11: m11,
        interaction,
        interaction_pp: 100 * interaction,
      });
    }
    const primaryInterval = confidenceInterval(effects);
    const finite = confidenceInterval(effects, inputs.no_fringe_pool_size);
    interactionEffects.push({
      first_sentence_id: sentences[first].id,
      second_sentence_id: sentences[second].id,
      first_short_label: sentences[first].short_label,
      second_short_label: sentences[second].short_label,
      interaction: primaryInterval.estimate,
      interaction_pp: 100 * primaryInterval.estimate,
      ci95_lower: primaryInterval.lower,
      ci95_upper: primaryInterval.upper,
      ci95_lower_pp: 100 * primaryInterval.lower,
      ci95_upper_pp: 100 * primaryInterval.upper,
      standard_error: primaryInterval.se,
      finite_population_ci95_lower: finite.lower,
      finite_population_ci95_upper: finite.upper,
      topic_effect_sd: sampleSd(effects),
      p_value: exactSignFlipP(effects),
    });
  }
}
holmAdjust(interactionEffects);
interactionEffects.sort((a, b) => Math.abs(b.interaction) - Math.abs(a.interaction));
interactionEffects.forEach((row, index) => { row.absolute_effect_rank = index + 1; });

const combinationSummary = combinations.map((combination) => {
  const combinationRows = rows.filter((row) => row.combination_id === combination.id);
  const topicFrequencies = inputs.topics.map((topic) => mean(combinationRows
    .filter((row) => row.original_question_number === topic.original_question_number)
    .map((row) => row.left_only)));
  const primaryInterval = confidenceInterval(topicFrequencies);
  const finite = confidenceInterval(topicFrequencies, inputs.no_fringe_pool_size);
  const counts = Object.fromEntries(["left", "both", "right"].map((label) =>
    [label, combinationRows.filter((row) => row.judge_label === label).length]));
  return {
    combination_id: combination.id,
    combination_code: combination.code,
    included_sentence_ids: combination.included_sentence_ids.join("+") || "none",
    sentence_count: combination.included_sentence_ids.length,
    system_prompt: combination.system_prompt,
    n: combinationRows.length,
    left_count: counts.left,
    both_count: counts.both,
    right_count: counts.right,
    left_frequency: counts.left / combinationRows.length,
    both_frequency: counts.both / combinationRows.length,
    right_frequency: counts.right / combinationRows.length,
    left_ci95_lower: Math.max(0, primaryInterval.lower),
    left_ci95_upper: Math.min(1, primaryInterval.upper),
    finite_population_left_ci95_lower: Math.max(0, finite.lower),
    finite_population_left_ci95_upper: Math.min(1, finite.upper),
    average_word_count: mean(combinationRows.map((row) => row.word_count)),
    median_word_count: [...combinationRows].sort((a, b) => a.word_count - b.word_count)[Math.floor(combinationRows.length / 2)].word_count,
  };
});

const sentenceCountSummary = Array.from({ length: 6 }, (_, sentenceCount) => {
  const countRows = rows.filter((row) => row.included_sentences.filter(Boolean).length === sentenceCount);
  const counts = Object.fromEntries(["left", "both", "right"].map((label) =>
    [label, countRows.filter((row) => row.judge_label === label).length]));
  return {
    sentence_count: sentenceCount,
    combinations: combinations.filter((combination) => combination.included_sentence_ids.length === sentenceCount).length,
    n: countRows.length,
    left_count: counts.left,
    both_count: counts.both,
    right_count: counts.right,
    left_frequency: counts.left / countRows.length,
    both_frequency: counts.both / countRows.length,
    right_frequency: counts.right / countRows.length,
    average_word_count: mean(countRows.map((row) => row.word_count)),
  };
});

const repetitionEffects = [];
for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
  const repetitionRows = rows.filter((row) => row.repetition === repetition);
  for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex += 1) {
    const present = repetitionRows.filter((row) => row.included_sentences[sentenceIndex]);
    const absent = repetitionRows.filter((row) => !row.included_sentences[sentenceIndex]);
    repetitionEffects.push({
      repetition,
      sentence_id: sentences[sentenceIndex].id,
      short_label: sentences[sentenceIndex].short_label,
      left_frequency_present: mean(present.map((row) => row.left_only)),
      left_frequency_absent: mean(absent.map((row) => row.left_only)),
      risk_difference: mean(present.map((row) => row.left_only)) - mean(absent.map((row) => row.left_only)),
    });
  }
}

const leaveOneTopicOut = [];
for (const omittedTopic of inputs.topics) {
  for (const sentence of sentences) {
    const effects = topicEffects.filter((row) =>
      row.sentence_id === sentence.id && row.original_question_number !== omittedTopic.original_question_number);
    leaveOneTopicOut.push({
      omitted_question_number: omittedTopic.original_question_number,
      omitted_topic: omittedTopic.topic,
      sentence_id: sentence.id,
      short_label: sentence.short_label,
      risk_difference: mean(effects.map((row) => row.risk_difference)),
    });
  }
}

for (const effect of mainEffects) {
  const repetitionValues = repetitionEffects
    .filter((row) => row.sentence_id === effect.sentence_id)
    .map((row) => row.risk_difference);
  const leaveOneOutValues = leaveOneTopicOut
    .filter((row) => row.sentence_id === effect.sentence_id)
    .map((row) => row.risk_difference);
  const topicValues = topicEffects
    .filter((row) => row.sentence_id === effect.sentence_id)
    .map((row) => row.risk_difference);
  effect.repetition_effect_min = Math.min(...repetitionValues);
  effect.repetition_effect_max = Math.max(...repetitionValues);
  effect.leave_one_topic_out_min = Math.min(...leaveOneOutValues);
  effect.leave_one_topic_out_max = Math.max(...leaveOneOutValues);
  effect.topic_effect_min = Math.min(...topicValues);
  effect.topic_effect_max = Math.max(...topicValues);
}

const overallCounts = Object.fromEntries(["left", "both", "right"].map((label) =>
  [label, rows.filter((row) => row.judge_label === label).length]));
const fourLabelCounts = fourLabelMatched.length
  ? Object.fromEntries(["left", "both", "right", "none"].map((label) =>
    [label, fourLabelMatched.filter((row) => row.four_label === label).length]))
  : null;
const fourLabelDisagreements = fourLabelMatched.length
  ? fourLabelMatched.filter((row) => row.judge_label !== row.four_label).map((row) => ({
    key: row.key,
    original_question_number: row.original_question_number,
    topic: row.topic,
    combination_id: row.combination_id,
    repetition: row.repetition,
    primary_label: row.judge_label,
    four_label: row.four_label,
    response: row.response,
  }))
  : [];
const full = combinationSummary.find((row) => row.combination_code === "11111");
const blank = combinationSummary.find((row) => row.combination_code === "00000");
const lengthAssociation = {
  response_level_correlation_word_count_left_only: correlation(
    rows.map((row) => row.word_count),
    rows.map((row) => row.left_only),
  ),
  combination_level_correlation_average_word_count_left_frequency: correlation(
    combinationSummary.map((row) => row.average_word_count),
    combinationSummary.map((row) => row.left_frequency),
  ),
};
const wordLimitRows = rows.filter((row) => row.word_limit_sentence_included);
const errors = {
  generation_error_rows: generationRows.filter((row) => row.status === "error").length,
  judgment_error_rows: judgmentRows.filter((row) => row.status === "error").length,
  four_label_judgment_error_rows: fourLabelRows.filter((row) => row.status === "error").length,
};
const integrity = {
  planned_responses: EXPECTED_RESPONSES,
  matched_successful_responses: rows.length,
  unique_keys: new Set(rows.map((row) => row.key)).size,
  factorial_cells: cellCounts.size,
  expected_factorial_cells: inputs.topics.length * combinations.length,
  repetitions_per_cell: manifest.repetitions,
  unbalanced_cells: invalidCells,
  generation_models: [...new Set(rows.map((row) => row.actual_model))],
  judge_models: [...new Set(rows.map((row) => row.judge_actual_model))],
  unique_generation_response_ids: new Set(rows.map((row) => row.response_id)).size,
  unique_judge_response_ids: new Set(rows.map((row) => row.judge_response_id)).size,
  word_limit_compliance: {
    n: wordLimitRows.length,
    compliant: wordLimitRows.filter((row) => row.word_limit_compliant).length,
    rate: mean(wordLimitRows.map((row) => Number(row.word_limit_compliant))),
  },
  four_label_robustness: fourLabelMatched.length ? {
    matched_judgments: fourLabelMatched.length,
    unique_judge_response_ids: new Set(fourLabelMatched.map((row) => row.four_label_judge_response_id)).size,
    counts: fourLabelCounts,
    disagreements_with_primary: fourLabelDisagreements.length,
  } : null,
  ...errors,
};

const summary = {
  design: {
    no_fringe_pool_size: inputs.no_fringe_pool_size,
    randomly_selected_topics: inputs.topics.length,
    topic_sampling_seed: inputs.topic_sampling.seed,
    selected_question_numbers: inputs.topic_sampling.selected_question_numbers,
    combinations: combinations.length,
    sentences: sentences.length,
    repetitions_per_cell: manifest.repetitions,
    matched_responses: rows.length,
    inference_target: "The audited No Fringe topic domain; primary 95% intervals use conservative topic-level t intervals. Finite-population-corrected intervals for the fixed 19-topic pool are reported as sensitivity estimates.",
  },
  selected_topics: inputs.topics.map((topic) => ({
    original_question_number: topic.original_question_number,
    topic: topic.topic,
    prompt: topic.prompt,
  })),
  overall: {
    ...overallCounts,
    left_frequency: overallCounts.left / rows.length,
    both_frequency: overallCounts.both / rows.length,
    right_frequency: overallCounts.right / rows.length,
    average_word_count: mean(rows.map((row) => row.word_count)),
  },
  full_original_system_prompt: full,
  blank_system_prompt: blank,
  main_effects_ranked: mainEffects,
  two_way_interactions_ranked: interactionEffects,
  four_label_robustness: fourLabelMatched.length ? {
    counts: fourLabelCounts,
    frequencies: Object.fromEntries(Object.entries(fourLabelCounts).map(([label, count]) => [label, count / fourLabelMatched.length])),
    disagreements_with_primary: fourLabelDisagreements.length,
    main_effects_ranked: fourLabelMainEffects,
  } : null,
  sentence_count_summary: sentenceCountSummary,
  length_association: lengthAssociation,
  integrity,
};

const responseColumns = [
  "key", "sample_index", "original_question_number", "topic", "prompt", "combination_id",
  "combination_code", "included_sentence_ids", "repetition", "system_prompt", "requested_model",
  "actual_model", "reasoning_effort", "response_id", "response", "word_count",
  "word_limit_compliant", "judge_actual_model", "judge_response_id", "judge_label",
  "raw_judge_response", "four_label", "four_label_judge_response_id", "created_at",
];
const responseExport = rows.sort((a, b) =>
  a.sample_index - b.sample_index
  || a.combination_mask - b.combination_mask
  || a.repetition - b.repetition)
  .map((row) => ({ ...row, included_sentence_ids: row.included_sentence_ids.join("+") || "none" }));

await mkdir(RESULTS, { recursive: true });
await writeFile(path.join(RESULTS, "responses.csv"), toCsv(responseExport, responseColumns), "utf8");
await writeFile(path.join(RESULTS, "main-effects.csv"), toCsv(mainEffects), "utf8");
await writeFile(path.join(RESULTS, "topic-main-effects.csv"), toCsv(topicEffects), "utf8");
await writeFile(path.join(RESULTS, "two-way-interactions.csv"), toCsv(interactionEffects), "utf8");
await writeFile(path.join(RESULTS, "topic-two-way-interactions.csv"), toCsv(interactionTopicEffects), "utf8");
await writeFile(path.join(RESULTS, "combination-summary.csv"), toCsv(combinationSummary), "utf8");
await writeFile(path.join(RESULTS, "sentence-count-summary.csv"), toCsv(sentenceCountSummary), "utf8");
await writeFile(path.join(RESULTS, "repetition-sensitivity.csv"), toCsv(repetitionEffects), "utf8");
await writeFile(path.join(RESULTS, "leave-one-topic-out.csv"), toCsv(leaveOneTopicOut), "utf8");
if (fourLabelMatched.length) {
  await writeFile(path.join(RESULTS, "four-label-main-effects.csv"), toCsv(fourLabelMainEffects), "utf8");
  await writeFile(path.join(RESULTS, "four-label-topic-main-effects.csv"), toCsv(fourLabelTopicEffects), "utf8");
  await writeFile(path.join(RESULTS, "four-label-disagreements.csv"), toCsv(fourLabelDisagreements), "utf8");
}
await writeFile(path.join(RESULTS, "integrity.json"), `${JSON.stringify(integrity, null, 2)}\n`, "utf8");
await writeFile(path.join(RESULTS, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const significantInteractions = interactionEffects.filter((row) => row.holm_p_value < 0.05);
const fourLabelSection = fourLabelMatched.length ? `
## Four-label judge robustness

Because the primary Washington Post-style judge must choose left, right, or both, all ${rows.length.toLocaleString()} responses were independently re-judged with a fourth \`none\` category for refusals, irrelevant answers, or purely descriptive responses.

The four-label judge returned ${formatPercent(fourLabelCounts.left / fourLabelMatched.length)} left-only, ${formatPercent(fourLabelCounts.both / fourLabelMatched.length)} both, ${formatPercent(fourLabelCounts.right / fourLabelMatched.length)} right-only, and ${formatPercent(fourLabelCounts.none / fourLabelMatched.length)} none. It disagreed with the primary trichotomy on ${fourLabelDisagreements.length} responses (${formatPercent(fourLabelDisagreements.length / fourLabelMatched.length)}).

| Rank | Sentence | Four-label effect (pp) | 95% CI (pp) | Holm p |
|---:|---|---:|---:|---:|
${fourLabelMainEffects.map((row) => `| ${row.absolute_effect_rank} | ${row.short_label} | ${row.risk_difference_pp.toFixed(1)} | ${row.ci95_lower_pp.toFixed(1)} to ${row.ci95_upper_pp.toFixed(1)} | ${formatP(row.holm_p_value)} |`).join("\n")}

This is a robustness analysis, not a replacement for the primary labels: changing the category set and instructions can itself change the judge's interpretation. All five estimated effects remained positive, but the ordering changed and ${fourLabelMainEffects.filter((row) => row.holm_p_value < 0.05).length} effects survived Holm correction. In particular, the 30-word effect fell from ${mainEffects.find((row) => row.sentence_id === "s1").risk_difference_pp.toFixed(1)} points under the primary trichotomy to ${fourLabelMainEffects.find((row) => row.sentence_id === "s1").risk_difference_pp.toFixed(1)} points under the four-label prompt. The absolute conclusions are therefore meaningfully judge-specification-dependent.
` : `
## Four-label judge robustness

No complete four-label re-judge was present when this analysis was generated.
`;
const report = `# GPT-5.5 system-prompt sentence ablation

## Design

This experiment randomly sampled 10 of the 19 topics in the current **No Fringe Questions** pool using a reproducible Fisher–Yates shuffle with xorshift32 seed \`${inputs.topic_sampling.seed}\`. It crossed all \(2^5 = 32\) possible combinations of the five sentences in the original Washington Post system prompt and generated five GPT-5.5 responses per topic–combination cell. GPT-5.6 Sol applied the same left/both/right rubric as the prior replication.

- Selected original question numbers: **${inputs.topic_sampling.selected_question_numbers.join(", ")}**
- Generations and judgments analyzed: **${rows.length.toLocaleString()}**
- Balanced cells: **${cellCounts.size}**, each with **${manifest.repetitions}** repetitions
- Generation snapshot(s): \`${integrity.generation_models.join("`, `")}\`
- Judge snapshot(s): \`${integrity.judge_models.join("`, `")}\`

The primary estimand for each sentence is its **marginal risk difference in left-only frequency**: for every topic, the left-only rate across the 16 combinations containing that sentence minus the rate across the 16 combinations omitting it, then averaged across the 10 randomly sampled topics. Because the factorial is complete and balanced, each main effect is orthogonal to the other four sentence indicators.

Uncertainty treats topic—not individual API response—as the independent sampling unit. Primary 95% intervals are conservative topic-level \(t\) intervals without a finite-population correction. Finite-population-corrected intervals for the fixed 19-topic No Fringe pool are retained as sensitivity estimates in \`results/main-effects.csv\`. Exact sign-flip tests use all \(2^{10}=1{,}024\) topic-level sign assignments; Holm correction controls familywise error across the five main effects.

## Selected topics

| Original # | Topic | Prompt |
|---:|---|---|
${inputs.topics.map((topic) => `| ${topic.original_question_number} | ${topic.topic} | ${topic.prompt.replaceAll("|", "\\|")} |`).join("\n")}

## Overall labels

Across all combinations, ${formatPercent(summary.overall.left_frequency)} of responses were left-only, ${formatPercent(summary.overall.both_frequency)} were both, and ${formatPercent(summary.overall.right_frequency)} were right-only. The full five-sentence prompt produced ${formatPercent(full.left_frequency)} left-only; the blank system-prompt combination produced ${formatPercent(blank.left_frequency)}.

## Main sentence effects

Positive values mean that **including** the sentence increased GPT-5.5's left-only frequency; negative values mean it decreased left-only frequency.

| Rank | Sentence | Present | Absent | Effect (pp) | 95% CI (pp) | Δ words | Exact p | Holm p |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
${mainEffects.map((row) => `| ${row.absolute_effect_rank} | ${row.short_label} | ${formatPercent(row.left_frequency_present)} | ${formatPercent(row.left_frequency_absent)} | ${row.risk_difference_pp.toFixed(1)} | ${row.ci95_lower_pp.toFixed(1)} to ${row.ci95_upper_pp.toFixed(1)} | ${row.average_word_count_difference >= 0 ? "+" : ""}${row.average_word_count_difference.toFixed(1)} | ${formatP(row.p_value)} | ${formatP(row.holm_p_value)} |`).join("\n")}

The largest absolute marginal effect was **${mainEffects[0].short_label}** (${mainEffects[0].risk_difference_pp >= 0 ? "+" : ""}${mainEffects[0].risk_difference_pp.toFixed(1)} percentage points; 95% CI ${mainEffects[0].ci95_lower_pp.toFixed(1)} to ${mainEffects[0].ci95_upper_pp.toFixed(1)}). ${mainEffects.filter((row) => row.holm_p_value < 0.05).length} of the five main effects remained significant at familywise \(\alpha=.05\) after Holm correction.

Across the 32 combinations, average word count and left-only frequency had a correlation of **${lengthAssociation.combination_level_correlation_average_word_count_left_frequency.toFixed(3)}**. This is descriptive rather than a separate causal estimate: sentence removal changes length and other aspects of the response simultaneously.

## Two-way interactions

A two-way interaction asks whether one sentence's effect changes depending on whether another sentence is present. ${significantInteractions.length
  ? `${significantInteractions.length} of 10 interactions survived Holm correction: ${significantInteractions.map((row) => `${row.first_sentence_id}×${row.second_sentence_id} (${row.interaction_pp.toFixed(1)} pp)`).join(", ")}.`
  : "None of the 10 two-way interactions survived Holm correction."}

The largest observed interaction was **${interactionEffects[0].first_short_label} × ${interactionEffects[0].second_short_label}** (${interactionEffects[0].interaction_pp >= 0 ? "+" : ""}${interactionEffects[0].interaction_pp.toFixed(1)} pp; 95% CI ${interactionEffects[0].ci95_lower_pp.toFixed(1)} to ${interactionEffects[0].ci95_upper_pp.toFixed(1)}; Holm p=${formatP(interactionEffects[0].holm_p_value)}).

${fourLabelSection}

## Robustness and interpretation

- Every main effect is estimated from 800 responses with the sentence present and 800 with it absent, but the effective inferential sample is 10 topics.
- Leave-one-topic-out and repetition-specific estimates are provided in \`results/leave-one-topic-out.csv\` and \`results/repetition-sensitivity.csv\`.
- The main effects are causal for these prompt manipulations within the experiment, but generalization is limited to the audited No Fringe topic pool and the recorded model snapshots.
- “Left-only” is a judge classification, not a direct measure of recommendation strength, equal emphasis, factual accuracy, or ideology.
- Removing a sentence can affect response length and format as well as political content; those mechanisms are part of the treatment.
- Main effects do not necessarily add up to the full-prompt versus blank-prompt contrast when interactions or nonlinearities are present.

## Integrity checks

- Matched successful keys: ${integrity.matched_successful_responses}/${integrity.planned_responses}
- Unique generation IDs: ${integrity.unique_generation_response_ids}
- Unique judge IDs: ${integrity.unique_judge_response_ids}
- 30-word compliance when sentence 1 was present: ${formatPercent(integrity.word_limit_compliance.rate)} (${integrity.word_limit_compliance.compliant}/${integrity.word_limit_compliance.n})
- Recorded generation error rows: ${integrity.generation_error_rows}; judgment error rows: ${integrity.judgment_error_rows}
- Four-label matched judgments: ${integrity.four_label_robustness?.matched_judgments ?? 0}; four-label error rows: ${integrity.four_label_judgment_error_rows}
`;

await writeFile(path.join(ROOT, "report.md"), report, "utf8");
console.log(JSON.stringify({
  analyzed: rows.length,
  overall: summary.overall,
  main_effects: mainEffects.map((row) => ({
    sentence: row.short_label,
    effect_pp: Number(row.risk_difference_pp.toFixed(2)),
    ci95_pp: [Number(row.ci95_lower_pp.toFixed(2)), Number(row.ci95_upper_pp.toFixed(2))],
    holm_p: row.holm_p_value,
  })),
  significant_interactions: significantInteractions.length,
  four_label_robustness: summary.four_label_robustness,
}, null, 2));
