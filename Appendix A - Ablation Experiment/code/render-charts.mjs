#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const RESULTS = path.join(ROOT, "results");
const CHARTS = path.join(ROOT, "charts");
const require = createRequire(import.meta.url);

const COLORS = {
  ink: "#20242B",
  muted: "#677080",
  grid: "#D9DDE5",
  light: "#F5F6F8",
  purple: "#6D45B5",
  purpleLight: "#BFA9E8",
  red: "#C94747",
  blue: "#3D74A8",
  positive: "#6D45B5",
  negative: "#C94747",
  white: "#FFFFFF",
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function text(x, y, value, options = {}) {
  const {
    size = 24, weight = 400, fill = COLORS.ink, anchor = "start",
    family = "Arial, Helvetica, sans-serif", italic = false,
  } = options;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ""}>${escapeXml(value)}</text>`;
}

function line(x1, y1, x2, y2, stroke = COLORS.grid, width = 2, extra = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
}

function rect(x, y, width, height, fill, extra = "") {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${extra}/>`;
}

function circle(cx, cy, radius, fill, extra = "") {
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" ${extra}/>`;
}

function svgDocument(width, height, content, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
${rect(0, 0, width, height, COLORS.white)}
${content.join("\n")}
</svg>
`;
}

function parseCsv(textValue) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < textValue.length; index += 1) {
    const char = textValue[index];
    if (quoted) {
      if (char === '"' && textValue[index + 1] === '"') {
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
  const header = rows.shift();
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function effectChart(mainEffects) {
  const width = 1500;
  const height = 850;
  const left = 420;
  const right = 1290;
  const top = 220;
  const rowHeight = 100;
  const domainMax = Math.max(10, ...mainEffects.flatMap((row) =>
    [Math.abs(Number(row.ci95_lower_pp)), Math.abs(Number(row.ci95_upper_pp))]));
  const domain = Math.ceil(domainMax / 5) * 5;
  const scale = (value) => left + ((value + domain) / (2 * domain)) * (right - left);
  const elements = [];
  elements.push(text(70, 78, "Which system-prompt sentences change left-only frequency?", { size: 42, weight: 500 }));
  elements.push(text(70, 122, "Complete 2⁵ factorial · 10 randomly sampled No Fringe topics · five repetitions per cell", { size: 23, fill: COLORS.muted }));
  elements.push(text(70, 160, "Dots are marginal risk differences; lines are conservative 95% topic-level intervals.", { size: 21, fill: COLORS.muted }));
  elements.push(text(left - 20, 202, "Decreases left-only", { size: 19, fill: COLORS.muted, anchor: "end" }));
  elements.push(text(right + 20, 202, "Increases left-only", { size: 19, fill: COLORS.muted }));

  for (let tick = -domain; tick <= domain; tick += 10) {
    const x = scale(tick);
    elements.push(line(x, top - 10, x, top + rowHeight * mainEffects.length, tick === 0 ? COLORS.ink : COLORS.grid, tick === 0 ? 3 : 1));
    elements.push(text(x, top + rowHeight * mainEffects.length + 42, `${tick > 0 ? "+" : ""}${tick} pp`, { size: 18, fill: COLORS.muted, anchor: "middle" }));
  }

  mainEffects.forEach((row, index) => {
    const y = top + index * rowHeight + 42;
    const effect = Number(row.risk_difference_pp);
    const lower = Number(row.ci95_lower_pp);
    const upper = Number(row.ci95_upper_pp);
    const color = effect >= 0 ? COLORS.positive : COLORS.negative;
    elements.push(text(70, y - 8, `${row.sentence_id.toUpperCase()} · ${row.short_label}`, { size: 26, weight: 500 }));
    elements.push(text(70, y + 24, `${(100 * Number(row.left_frequency_present)).toFixed(1)}% present vs ${(100 * Number(row.left_frequency_absent)).toFixed(1)}% absent`, { size: 18, fill: COLORS.muted }));
    elements.push(line(scale(lower), y, scale(upper), y, color, 6, 'stroke-linecap="round"'));
    elements.push(line(scale(lower), y - 12, scale(lower), y + 12, color, 4));
    elements.push(line(scale(upper), y - 12, scale(upper), y + 12, color, 4));
    elements.push(circle(scale(effect), y, 11, color, `stroke="${COLORS.white}" stroke-width="3"`));
    const labelX = effect >= 0 ? scale(upper) + 16 : scale(lower) - 16;
    elements.push(text(labelX, y + 7, `${effect >= 0 ? "+" : ""}${effect.toFixed(1)} pp`, { size: 22, weight: 500, fill: color, anchor: effect >= 0 ? "start" : "end" }));
  });
  elements.push(text(70, height - 36, "Positive = including the sentence increased left-only classifications. Familywise inference uses Holm-adjusted exact sign-flip tests.", { size: 19, fill: COLORS.muted }));
  return svgDocument(width, height, elements, "Forest plot of the five system-prompt sentence effects on GPT-5.5 left-only frequency.");
}

function combinationChart(rows) {
  const sorted = [...rows].sort((a, b) => Number(b.left_frequency) - Number(a.left_frequency)
    || a.combination_code.localeCompare(b.combination_code));
  const width = 1700;
  const height = 1760;
  const left = 430;
  const right = 1570;
  const top = 255;
  const rowHeight = 43;
  const elements = [];
  elements.push(text(70, 72, "All 32 prompt-sentence combinations", { size: 42, weight: 500 }));
  elements.push(text(70, 116, "Each bar pools 50 responses: 10 topics × five repetitions. Sorted by left-only frequency.", { size: 23, fill: COLORS.muted }));
  elements.push(text(70, 158, "Codes show S1–S5 in original sentence order; 1 = present and 0 = omitted.", { size: 21, fill: COLORS.muted }));
  elements.push(rect(70, 184, 24, 18, COLORS.purple));
  elements.push(text(104, 200, "Left-only", { size: 19 }));
  elements.push(rect(235, 184, 24, 18, COLORS.purpleLight));
  elements.push(text(269, 200, "Both", { size: 19 }));
  elements.push(rect(370, 184, 24, 18, COLORS.red));
  elements.push(text(404, 200, "Right-only", { size: 19 }));

  [0, 0.25, 0.5, 0.75, 1].forEach((tick) => {
    const x = left + tick * (right - left);
    elements.push(line(x, top - 10, x, top + rowHeight * sorted.length, COLORS.grid, tick === 0 || tick === 1 ? 2 : 1));
    elements.push(text(x, top - 24, `${Math.round(100 * tick)}%`, { size: 18, fill: COLORS.muted, anchor: "middle" }));
  });

  sorted.forEach((row, index) => {
    const y = top + index * rowHeight;
    const leftFrequency = Number(row.left_frequency);
    const bothFrequency = Number(row.both_frequency);
    const rightFrequency = Number(row.right_frequency);
    const label = row.included_sentence_ids === "none" ? "none" : row.included_sentence_ids.toUpperCase().replaceAll("+", " ");
    elements.push(text(70, y + 27, row.combination_code, { size: 21, weight: 500 }));
    elements.push(text(205, y + 27, label, { size: 18, fill: COLORS.muted }));
    const totalWidth = right - left;
    elements.push(rect(left, y + 7, totalWidth * leftFrequency, 25, COLORS.purple));
    elements.push(rect(left + totalWidth * leftFrequency, y + 7, totalWidth * bothFrequency, 25, COLORS.purpleLight));
    elements.push(rect(left + totalWidth * (leftFrequency + bothFrequency), y + 7, totalWidth * rightFrequency, 25, COLORS.red));
    elements.push(text(right + 16, y + 28, `${(100 * leftFrequency).toFixed(0)}% left`, { size: 19, weight: 500 }));
  });
  elements.push(text(70, height - 40, "S1 30-word cap · S2 9th-grade level · S3 omit prompt details · S4 no first person · S5 no essay title", { size: 20, fill: COLORS.muted }));
  return svgDocument(width, height, elements, "Stacked bar chart of left-only, both, and right-only labels for all 32 system-prompt combinations.");
}

function interactionChart(interactions, sentenceLabels) {
  const width = 1250;
  const height = 1120;
  const left = 340;
  const top = 270;
  const cell = 135;
  const elements = [];
  const lookup = new Map();
  interactions.forEach((row) => {
    lookup.set(`${row.first_sentence_id}:${row.second_sentence_id}`, Number(row.interaction_pp));
    lookup.set(`${row.second_sentence_id}:${row.first_sentence_id}`, Number(row.interaction_pp));
  });
  const maxAbs = Math.max(1, ...[...lookup.values()].map(Math.abs));
  const mix = (hex1, hex2, proportion) => {
    const parse = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    const first = parse(hex1);
    const second = parse(hex2);
    return `#${first.map((value, index) =>
      Math.round(value + (second[index] - value) * proportion).toString(16).padStart(2, "0")).join("")}`;
  };
  elements.push(text(70, 76, "Do sentence effects depend on one another?", { size: 42, weight: 500 }));
  elements.push(text(70, 120, "Two-way factorial interactions in left-only frequency (percentage points)", { size: 23, fill: COLORS.muted }));
  elements.push(text(70, 158, "Purple = mutually reinforcing; red = offsetting. Values average topic-level differences-in-differences.", { size: 21, fill: COLORS.muted }));

  sentenceLabels.forEach((sentence, index) => {
    elements.push(text(left + index * cell + cell / 2, top - 32, sentence.id.toUpperCase(), { size: 24, weight: 500, anchor: "middle" }));
    elements.push(text(left - 24, top + index * cell + cell / 2 + 8, sentence.id.toUpperCase(), { size: 24, weight: 500, anchor: "end" }));
  });

  sentenceLabels.forEach((rowSentence, rowIndex) => {
    sentenceLabels.forEach((columnSentence, columnIndex) => {
      const x = left + columnIndex * cell;
      const y = top + rowIndex * cell;
      if (rowIndex === columnIndex) {
        elements.push(rect(x, y, cell - 4, cell - 4, COLORS.light));
        elements.push(text(x + cell / 2 - 2, y + cell / 2 + 7, "—", { size: 27, fill: COLORS.muted, anchor: "middle" }));
      } else {
        const value = lookup.get(`${rowSentence.id}:${columnSentence.id}`);
        const strength = Math.min(0.78, 0.18 + 0.6 * Math.abs(value) / maxAbs);
        const fill = value >= 0 ? mix(COLORS.white, COLORS.purple, strength) : mix(COLORS.white, COLORS.red, strength);
        elements.push(rect(x, y, cell - 4, cell - 4, fill));
        elements.push(text(x + cell / 2 - 2, y + cell / 2 + 7, `${value >= 0 ? "+" : ""}${value.toFixed(1)}`, { size: 24, weight: 500, anchor: "middle" }));
      }
    });
  });
  sentenceLabels.forEach((sentence, index) => {
    elements.push(text(70, 860 + index * 30, `${sentence.id.toUpperCase()}  ${sentence.short_label}`, { size: 21, fill: index === 0 ? COLORS.ink : COLORS.muted, weight: index === 0 ? 500 : 400 }));
  });
  elements.push(text(70, height - 34, "Formal estimates, 95% intervals, exact sign-flip p-values, and Holm adjustments are in results/two-way-interactions.csv.", { size: 19, fill: COLORS.muted }));
  return svgDocument(width, height, elements, "Heatmap of the ten two-way interactions among the five system-prompt sentences.");
}

function judgeRobustnessChart(primaryEffects, robustnessEffects) {
  const robustnessById = new Map(robustnessEffects.map((row) => [row.sentence_id, row]));
  const width = 1500;
  const height = 930;
  const left = 420;
  const right = 1320;
  const top = 260;
  const rowHeight = 115;
  const allRows = primaryEffects.flatMap((row) => [row, robustnessById.get(row.sentence_id)]);
  const domain = Math.max(20, Math.ceil(Math.max(...allRows.flatMap((row) =>
    [Math.abs(Number(row.ci95_lower_pp)), Math.abs(Number(row.ci95_upper_pp))])) / 10) * 10);
  const scale = (value) => left + ((value + domain) / (2 * domain)) * (right - left);
  const elements = [];
  elements.push(text(70, 76, "Sentence effects depend on the judging specification", { size: 42, weight: 500 }));
  elements.push(text(70, 120, "Primary left/right/both judge compared with a four-label judge that also permits “none”", { size: 23, fill: COLORS.muted }));
  elements.push(circle(82, 173, 9, COLORS.purple));
  elements.push(text(105, 181, "Primary trichotomy", { size: 20 }));
  elements.push(circle(310, 173, 9, COLORS.blue));
  elements.push(text(333, 181, "Four-label robustness", { size: 20 }));

  for (let tick = -domain; tick <= domain; tick += 10) {
    const x = scale(tick);
    elements.push(line(x, top - 20, x, top + rowHeight * primaryEffects.length, tick === 0 ? COLORS.ink : COLORS.grid, tick === 0 ? 3 : 1));
    elements.push(text(x, top + rowHeight * primaryEffects.length + 38, `${tick > 0 ? "+" : ""}${tick} pp`, { size: 18, fill: COLORS.muted, anchor: "middle" }));
  }

  primaryEffects.forEach((primary, index) => {
    const robustness = robustnessById.get(primary.sentence_id);
    const center = top + index * rowHeight + 48;
    elements.push(text(70, center + 7, `${primary.sentence_id.toUpperCase()} · ${primary.short_label}`, { size: 25, weight: 500 }));
    [
      { row: primary, y: center - 16, color: COLORS.purple },
      { row: robustness, y: center + 18, color: COLORS.blue },
    ].forEach(({ row, y, color }) => {
      const effect = Number(row.risk_difference_pp);
      const lower = Number(row.ci95_lower_pp);
      const upper = Number(row.ci95_upper_pp);
      elements.push(line(scale(lower), y, scale(upper), y, color, 5, 'stroke-linecap="round"'));
      elements.push(circle(scale(effect), y, 9, color, `stroke="${COLORS.white}" stroke-width="2"`));
      elements.push(text(scale(upper) + 12, y + 6, `${effect >= 0 ? "+" : ""}${effect.toFixed(1)}`, { size: 18, weight: 500, fill: color }));
    });
  });
  elements.push(text(70, height - 34, "Both analyses use the same 1,600 GPT-5.5 responses. Only the GPT-5.6 Sol category instructions differ.", { size: 19, fill: COLORS.muted }));
  return svgDocument(width, height, elements, "Comparison of primary and four-label judge estimates for each system-prompt sentence effect.");
}

async function writeChart(name, svg) {
  const svgPath = path.join(CHARTS, `${name}.svg`);
  const pngPath = path.join(CHARTS, `${name}.png`);
  await writeFile(svgPath, svg, "utf8");
  let pngWritten = false;
  try {
    const sharp = require("sharp");
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
    pngWritten = true;
  } catch (error) {
    console.warn(`PNG rendering skipped for ${name}: ${error.message}`);
  }
  return { svgPath, pngPath: pngWritten ? pngPath : null };
}

await mkdir(CHARTS, { recursive: true });
const summary = JSON.parse(await readFile(path.join(RESULTS, "summary.json"), "utf8"));
const combinationRows = parseCsv(await readFile(path.join(RESULTS, "combination-summary.csv"), "utf8"));
const outputs = [];
outputs.push(await writeChart("main-effects", effectChart(summary.main_effects_ranked)));
outputs.push(await writeChart("combination-frequencies", combinationChart(combinationRows)));
outputs.push(await writeChart("two-way-interactions", interactionChart(summary.two_way_interactions_ranked, summary.main_effects_ranked
  .slice()
  .sort((a, b) => a.sentence_id.localeCompare(b.sentence_id))
  .map((row) => ({ id: row.sentence_id, short_label: row.short_label })))));
if (summary.four_label_robustness?.main_effects_ranked?.length) {
  outputs.push(await writeChart("judge-robustness", judgeRobustnessChart(
    summary.main_effects_ranked,
    summary.four_label_robustness.main_effects_ranked,
  )));
}
console.log(JSON.stringify(outputs, null, 2));
