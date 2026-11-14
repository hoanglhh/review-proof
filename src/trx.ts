// Per-test outcomes from a TRX file. Pass/fail is decided here, never from the exit code or log text:
// The .NET test runner prints "Build FAILED" and exits 1 when the only problem is failing tests.

export type Outcome = "passed" | "failed" | "skipped" | "other";
export type TestResult = { name: string; outcome: Outcome; rawOutcome: string; message?: string };

const unescape = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-f]+|#[0-9]+);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);

function outcome(raw: string): Outcome {
  if (raw === "Passed") return "passed";
  if (["Failed", "Error", "Timeout", "Aborted"].includes(raw)) return "failed";
  if (["NotExecuted", "Inconclusive", "Pending", "NotRunnable"].includes(raw)) return "skipped";
  return "other";
}

export function parseTrx(xml: string): TestResult[] {
  const results: TestResult[] = [];
  // attribute values may contain '>' so quoted strings are matched as units
  const re = /<UnitTestResult\s((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g;
  for (const m of xml.matchAll(re)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [a[1], unescape(a[2] ?? a[3])]));
    const message = m[2] && /<Message>([\s\S]*?)<\/Message>/.exec(m[2])?.[1];
    if (!attrs.testName) continue;
    results.push({
      name: attrs.testName,
      outcome: outcome(attrs.outcome ?? ""),
      rawOutcome: attrs.outcome ?? "",
      ...(message ? { message: unescape(message).slice(0, 20000) } : {}), // diagnostics can sit far into a long message
    });
  }
  return results;
}
