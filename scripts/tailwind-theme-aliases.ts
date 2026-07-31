/// <reference types="node" />

import { readFile, writeFile } from "node:fs/promises";

declare const Bun: {
  Glob: new (pattern: string) => {
    scan(cwd: string): AsyncIterable<string>;
  };
};

const checkOnly = process.argv.includes("--check");
const files = new Bun.Glob("src/**/*.{ts,tsx,jsx,js}");
const aliasPattern = /([a-z][a-z0-9-]*)-\(--(accent|ring)\)/g;
let changedFiles = 0;
let replacements = 0;

for await (const file of files.scan(".")) {
  const source = await readFile(file, "utf8");
  const matches = source.match(aliasPattern);
  if (!matches) continue;

  const next = source.replace(aliasPattern, "$1-$2");
  replacements += matches.length;
  changedFiles += 1;

  if (!checkOnly) {
    await writeFile(file, next, "utf8");
  }
}

console.log(`Tailwind theme aliases: changed=${changedFiles} replacements=${replacements}`);

if (checkOnly && replacements > 0) {
  process.exitCode = 1;
}
