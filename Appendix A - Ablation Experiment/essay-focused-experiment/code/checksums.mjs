#!/usr/bin/env node
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CODE_DIR, "..");
const OUTPUT = path.join(ROOT, "CHECKSUMS.sha256");

async function walk(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    if (entry === "CHECKSUMS.sha256" || entry === ".env") continue;
    const file = path.join(directory, entry);
    if ((await stat(file)).isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}

const files = (await walk(ROOT)).sort();
const lines = [];
for (const file of files) {
  const digest = createHash("sha256").update(await readFile(file)).digest("hex");
  lines.push(`${digest}  ${path.relative(ROOT, file)}`);
}
await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT, files: files.length }, null, 2));
