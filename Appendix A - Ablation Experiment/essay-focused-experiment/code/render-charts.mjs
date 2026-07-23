#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const RESULTS = path.join(ROOT, "results");
const CHARTS = path.join(ROOT, "charts");

const summary = JSON.parse(await readFile(path.join(RESULTS, "summary.json"), "utf8"));
await mkdir(CHARTS, { recursive: true });

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const armOrder = ["control", "essay", "output", "response", "heading"];
const armLabels = new Map([
  ["control", "No sentence 5"],
  ["essay", "Essay"],
  ["output", "Output"],
  ["response", "Response"],
  ["heading", "Heading"],
]);
const primaryArms = new Map(summary.arm_summaries
  .filter((row) => row.outcome === "primary")
  .map((row) => [row.arm_id, row]));
const fourArms = new Map(summary.arm_summaries
  .filter((row) => row.outcome === "four_label")
  .map((row) => [row.arm_id, row]));

const width = 980;
const height = 560;
const margin = { top: 68, right: 90, bottom: 90, left: 190 };
const plotWidth = width - margin.left - margin.right;
const plotHeight = height - margin.top - margin.bottom;
const xRate = (value) => margin.left + Math.max(0, Math.min(1, value)) * plotWidth;
const yArm = (index) => margin.top + 48 + index * (plotHeight - 70) / (armOrder.length - 1);
const pct = (value) => `${(100 * value).toFixed(1)}%`;

let rateMarks = "";
for (let index = 0; index < armOrder.length; index += 1) {
  const armId = armOrder[index];
  const y = yArm(index);
  const primary = primaryArms.get(armId);
  const four = fourArms.get(armId);
  rateMarks += `
    <text x="${margin.left - 18}" y="${y + 5}" text-anchor="end" class="label">${escapeXml(armLabels.get(armId))}</text>
    <line x1="${xRate(primary.ci95_lower)}" y1="${y - 7}" x2="${xRate(primary.ci95_upper)}" y2="${y - 7}" class="ci primary"/>
    <circle cx="${xRate(primary.left_frequency)}" cy="${y - 7}" r="6" class="point primary"/>
    <text x="${xRate(primary.left_frequency) + 12}" y="${y - 3}" class="value">${pct(primary.left_frequency)}</text>
    <line x1="${xRate(four.ci95_lower)}" y1="${y + 13}" x2="${xRate(four.ci95_upper)}" y2="${y + 13}" class="ci robust"/>
    <path d="M ${xRate(four.left_frequency)} ${y + 6} l 7 7 l -7 7 l -7 -7 z" class="point robust"/>
    <text x="${xRate(four.left_frequency) + 12}" y="${y + 17}" class="value">${pct(four.left_frequency)}</text>`;
}
const rateTicks = Array.from({ length: 6 }, (_, index) => index / 5).map((value) => `
  <line x1="${xRate(value)}" y1="${margin.top}" x2="${xRate(value)}" y2="${height - margin.bottom}" class="grid"/>
  <text x="${xRate(value)}" y="${height - margin.bottom + 28}" text-anchor="middle" class="tick">${Math.round(100 * value)}%</text>`).join("");

const rateSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Left-only frequency by sentence-5 wording</title>
  <desc id="desc">Five arms compared under the primary three-label and robustness four-label judges, with topic-level 95 percent intervals.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #172033; }
    .title { font-size: 24px; font-weight: 600; }
    .subtitle, .tick, .legend { font-size: 14px; fill: #536078; }
    .label { font-size: 16px; font-weight: 600; }
    .value { font-size: 13px; font-variant-numeric: tabular-nums; }
    .grid { stroke: #d9dee8; stroke-width: 1; }
    .ci { stroke-width: 3; }
    .ci.primary { stroke: #1769aa; }
    .ci.robust { stroke: #b15518; }
    .point.primary { fill: #1769aa; }
    .point.robust { fill: #b15518; }
  </style>
  <text x="${margin.left}" y="32" class="title">Left-only frequency by wording</text>
  <text x="${margin.left}" y="55" class="subtitle">Points are arm means; lines are topic-level 95% intervals</text>
  ${rateTicks}
  ${rateMarks}
  <circle cx="${margin.left}" cy="${height - 30}" r="6" class="point primary"/>
  <text x="${margin.left + 14}" y="${height - 25}" class="legend">Three-label primary judge</text>
  <path d="M ${margin.left + 226} ${height - 37} l 7 7 l -7 7 l -7 -7 z" class="point robust"/>
  <text x="${margin.left + 240}" y="${height - 25}" class="legend">Four-label robustness judge</text>
</svg>`;

const effectOrder = ["essay", "output", "response", "heading"];
const primaryEffects = new Map(summary.contrasts.primary.versus_control.map((row) => [row.left_arm, row]));
const fourEffects = new Map(summary.contrasts.four_label.versus_control.map((row) => [row.left_arm, row]));
const allBounds = [...primaryEffects.values(), ...fourEffects.values()]
  .flatMap((row) => [row.ci95_lower, row.ci95_upper, row.estimate]);
const lowerBound = Math.min(-0.10, Math.floor(20 * Math.min(...allBounds)) / 20);
const upperBound = Math.max(0.30, Math.ceil(20 * Math.max(...allBounds)) / 20);
const xEffect = (value) => margin.left + (value - lowerBound) / (upperBound - lowerBound) * plotWidth;
let effectMarks = "";
for (let index = 0; index < effectOrder.length; index += 1) {
  const armId = effectOrder[index];
  const y = margin.top + 60 + index * (plotHeight - 95) / (effectOrder.length - 1);
  const primary = primaryEffects.get(armId);
  const four = fourEffects.get(armId);
  effectMarks += `
    <text x="${margin.left - 18}" y="${y + 5}" text-anchor="end" class="label">${escapeXml(armLabels.get(armId))}</text>
    <line x1="${xEffect(primary.ci95_lower)}" y1="${y - 8}" x2="${xEffect(primary.ci95_upper)}" y2="${y - 8}" class="ci primary"/>
    <circle cx="${xEffect(primary.estimate)}" cy="${y - 8}" r="6" class="point primary"/>
    <text x="${xEffect(primary.estimate) + 12}" y="${y - 4}" class="value">${(100 * primary.estimate).toFixed(1)} pp</text>
    <line x1="${xEffect(four.ci95_lower)}" y1="${y + 14}" x2="${xEffect(four.ci95_upper)}" y2="${y + 14}" class="ci robust"/>
    <path d="M ${xEffect(four.estimate)} ${y + 7} l 7 7 l -7 7 l -7 -7 z" class="point robust"/>
    <text x="${xEffect(four.estimate) + 12}" y="${y + 18}" class="value">${(100 * four.estimate).toFixed(1)} pp</text>`;
}
const effectTickCount = Math.round((upperBound - lowerBound) / 0.10);
const effectTicks = Array.from({ length: effectTickCount + 1 }, (_, index) =>
  lowerBound + index * 0.10).map((value) => `
  <line x1="${xEffect(value)}" y1="${margin.top}" x2="${xEffect(value)}" y2="${height - margin.bottom}" class="${Math.abs(value) < 1e-9 ? "zero" : "grid"}"/>
  <text x="${xEffect(value)}" y="${height - margin.bottom + 28}" text-anchor="middle" class="tick">${Math.round(100 * value)}</text>`).join("");

const effectSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Sentence-5 wording effects versus no sentence 5</title>
  <desc id="desc">Risk differences in left-only frequency for four title or heading instructions versus control under two judge specifications.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #172033; }
    .title { font-size: 24px; font-weight: 600; }
    .subtitle, .tick, .legend { font-size: 14px; fill: #536078; }
    .label { font-size: 16px; font-weight: 600; }
    .value { font-size: 13px; font-variant-numeric: tabular-nums; }
    .grid { stroke: #d9dee8; stroke-width: 1; }
    .zero { stroke: #4a5568; stroke-width: 2; }
    .ci { stroke-width: 3; }
    .ci.primary { stroke: #1769aa; }
    .ci.robust { stroke: #b15518; }
    .point.primary { fill: #1769aa; }
    .point.robust { fill: #b15518; }
  </style>
  <text x="${margin.left}" y="32" class="title">Effect versus no sentence 5</text>
  <text x="${margin.left}" y="55" class="subtitle">Risk difference in left-only frequency (percentage points); topic-level 95% intervals</text>
  ${effectTicks}
  ${effectMarks}
  <text x="${margin.left + plotWidth / 2}" y="${height - margin.bottom + 58}" text-anchor="middle" class="legend">Percentage-point effect</text>
  <circle cx="${margin.left}" cy="${height - 26}" r="6" class="point primary"/>
  <text x="${margin.left + 14}" y="${height - 21}" class="legend">Three-label primary judge</text>
  <path d="M ${margin.left + 226} ${height - 33} l 7 7 l -7 7 l -7 -7 z" class="point robust"/>
  <text x="${margin.left + 240}" y="${height - 21}" class="legend">Four-label robustness judge</text>
</svg>`;

await Promise.all([
  writeFile(path.join(CHARTS, "arm-left-only-rates.svg"), rateSvg, "utf8"),
  writeFile(path.join(CHARTS, "effects-vs-control.svg"), effectSvg, "utf8"),
]);
console.log(JSON.stringify({
  charts: [
    path.join(CHARTS, "arm-left-only-rates.svg"),
    path.join(CHARTS, "effects-vs-control.svg"),
  ],
}, null, 2));
