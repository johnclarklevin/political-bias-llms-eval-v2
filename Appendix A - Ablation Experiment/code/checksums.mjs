#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "CHECKSUMS.sha256");

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || entry.name === "CHECKSUMS.sha256") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const files = (await walk(ROOT)).sort();
const lines = [];
for (const file of files) {
  const digest = createHash("sha256").update(await readFile(file)).digest("hex");
  lines.push(`${digest}  ${path.relative(ROOT, file).split(path.sep).join("/")}`);
}
await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${lines.length} checksums to ${OUTPUT}`);
