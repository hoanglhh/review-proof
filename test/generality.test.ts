// The pipeline must not be a script for four known diffs: corpus-specific names may appear only in the
// profile, the case list and the labels, never in pipeline code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");
const FORBIDDEN = /MessagePack|messagepack|MsgPack|SourceGenerator|dotnet|\.csproj|\b(2283|2234|2129|2297)\b|ju26|junction26|32258fdb|9df83c38|9007cee1|083afd99|a0aa5ab2/;

test("no corpus-specific names in pipeline code", () => {
  const offenders: string[] = [];
  for (const f of readdirSync(SRC, { recursive: true }) as string[]) {
    if (!f.endsWith(".ts")) continue;
    readFileSync(join(SRC, f), "utf8").split("\n").forEach((line, i) => {
      if (FORBIDDEN.test(line)) offenders.push(`src/${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
