import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTrx } from "../src/trx.ts";

// Hand-written fixture in the shape `dotnet test --logger trx` writes. Not output from a real run.
const trx = `<?xml version="1.0" encoding="utf-8"?>
<TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <Results>
    <UnitTestResult executionId="1" testId="a" testName="Suite.Passes" duration="00:00:01" outcome="Passed" />
    <UnitTestResult executionId="2" testId="b" testName="Suite.Theory(x: &quot;a&gt;b&quot;)" outcome="Failed">
      <Output><ErrorInfo><Message>System.IndexOutOfRangeException: Index was outside the bounds &lt;of&gt; the array.</Message><StackTrace>at X</StackTrace></ErrorInfo></Output>
    </UnitTestResult>
    <UnitTestResult testName='Suite.Skipped' outcome="NotExecuted"></UnitTestResult>
  </Results>
  <ResultSummary outcome="Failed"><Counters total="3" passed="1" failed="1" /></ResultSummary>
</TestRun>`;

test("parses per-test outcomes, unescapes names and keeps failure messages", () => {
  const r = parseTrx(trx);
  assert.deepEqual(r.map((t) => [t.name, t.outcome]), [
    ["Suite.Passes", "passed"],
    ['Suite.Theory(x: "a>b")', "failed"],
    ["Suite.Skipped", "skipped"],
  ]);
  assert.match(r[1].message!, /IndexOutOfRangeException: Index was outside the bounds <of> the array/);
  assert.equal(r[0].message, undefined);
});

test("no results in an empty or truncated file", () => {
  assert.deepEqual(parseTrx(""), []);
  assert.deepEqual(parseTrx("<TestRun><Results><UnitTestResult testName"), []);
});
