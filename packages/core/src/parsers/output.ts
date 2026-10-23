import { stripAnsi } from '../util/text.js';

export interface TestSummary {
  framework?: string;
  passed?: number;
  failed?: number;
  skipped?: number;
  /** Names of failing tests when they can be identified. */
  failures: string[];
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));

/** Extract pass/fail counts from common test runners' output. */
export function parseTestOutput(raw: string): TestSummary {
  const out = stripAnsi(raw);
  const failures = new Set<string>();
  let m: RegExpExecArray | null;

  // vitest / jest:  "Tests  1 failed | 4 passed (5)"  /  "Tests:       1 failed, 4 passed, 5 total"
  m = [...out.matchAll(/^\s*Tests?:?\s+(?!Files)(?:(\d+) failed)?[\s|,]*(?:(\d+) passed)?[\s|,]*(?:(\d+) skipped)?/gm)].find((x) => x[1] || x[2]) ?? null;
  if (m) {
    for (const f of out.matchAll(/^\s*(?:FAIL|×|✕|✗)\s+(.+)$/gm)) failures.add(f[1].trim().slice(0, 200));
    const framework = /vitest|VITEST/.test(out) ? 'vitest' : /jest/i.test(out) ? 'jest' : 'js';
    return { framework, failed: num(m[1]) ?? 0, passed: num(m[2]) ?? 0, skipped: num(m[3]), failures: [...failures].slice(0, 20) };
  }
  // pytest: "=== 2 failed, 10 passed, 1 skipped in 0.12s ==="
  if ((m = /=+ (?:(\d+) failed)?[, ]*(?:(\d+) passed)?[, ]*(?:(\d+) skipped)?[^=\n]* in [\d.]+s/m.exec(out)) && (m[1] || m[2])) {
    for (const f of out.matchAll(/^FAILED (\S+)/gm)) failures.add(f[1]);
    return { framework: 'pytest', failed: num(m[1]) ?? 0, passed: num(m[2]) ?? 0, skipped: num(m[3]), failures: [...failures].slice(0, 20) };
  }
  // cargo: "test result: FAILED. 3 passed; 1 failed; 0 ignored"
  const cargo = [...out.matchAll(/test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored/g)];
  if (cargo.length) {
    for (const f of out.matchAll(/^test (\S+) \.\.\. FAILED/gm)) failures.add(f[1]);
    return {
      framework: 'cargo',
      passed: cargo.reduce((s, c) => s + Number(c[1]), 0),
      failed: cargo.reduce((s, c) => s + Number(c[2]), 0),
      skipped: cargo.reduce((s, c) => s + Number(c[3]), 0),
      failures: [...failures].slice(0, 20),
    };
  }
  // go test: "--- FAIL: TestX" / "ok  pkg" / "FAIL pkg"
  if (/^(ok|FAIL|---)\s/m.test(out) && /_test\.go|^(ok|FAIL)\s+\S+\s+[\d.]+s|^--- (FAIL|PASS): \w+/m.test(out)) {
    const fails = [...out.matchAll(/^--- FAIL: (\S+)/gm)].map((x) => x[1]);
    const passes = [...out.matchAll(/^--- PASS: (\S+)/gm)].length;
    return { framework: 'go', passed: passes || undefined, failed: fails.length, failures: fails.slice(0, 20) };
  }
  // node:test (TAP-ish summary): "# pass 3" "# fail 1"
  if ((m = /^# pass (\d+)/m.exec(out))) {
    const fail = /^# fail (\d+)/m.exec(out);
    const skip = /^# skipped (\d+)/m.exec(out);
    for (const f of out.matchAll(/^not ok \d+ - (.+)$/gm)) failures.add(f[1].trim());
    for (const f of out.matchAll(/^\s*✖ (.+?)(?: \([\d.]+m?s\))?$/gm)) failures.add(f[1].trim());
    return { framework: 'node:test', passed: Number(m[1]), failed: fail ? Number(fail[1]) : 0, skipped: skip ? Number(skip[1]) : undefined, failures: [...failures].slice(0, 20) };
  }
  // node:test spec reporter: "ℹ pass 3" "ℹ fail 1"
  if ((m = /^ℹ pass (\d+)/m.exec(out))) {
    const fail = /^ℹ fail (\d+)/m.exec(out);
    for (const f of out.matchAll(/^\s*✖ (.+?)(?: \([\d.]+m?s\))?$/gm)) failures.add(f[1].trim());
    return { framework: 'node:test', passed: Number(m[1]), failed: fail ? Number(fail[1]) : 0, failures: [...failures].slice(0, 20) };
  }
  // mocha: "  3 passing" "  1 failing"
  if ((m = /^\s+(\d+) passing/m.exec(out))) {
    const fail = /^\s+(\d+) failing/m.exec(out);
    const pend = /^\s+(\d+) pending/m.exec(out);
    return { framework: 'mocha', passed: Number(m[1]), failed: fail ? Number(fail[1]) : 0, skipped: pend ? Number(pend[1]) : undefined, failures: [] };
  }
  // unittest: "Ran 5 tests" + "FAILED (failures=1)" / "OK"
  if ((m = /^Ran (\d+) tests? in/m.exec(out))) {
    const f = /FAILED \((?:failures=(\d+))?(?:, )?(?:errors=(\d+))?/.exec(out);
    const failed = f ? Number(f[1] ?? 0) + Number(f[2] ?? 0) : 0;
    return { framework: 'unittest', passed: Number(m[1]) - failed, failed, failures: [] };
  }
  return { failures: [] };
}

export interface Diagnostic {
  file?: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  code?: string;
  message: string;
  source: string;
}

/** Parse compiler, linter, type-checker and runtime errors into structured diagnostics. */
export function parseDiagnostics(raw: string): Diagnostic[] {
  const out = stripAnsi(raw);
  const diags: Diagnostic[] = [];
  const seen = new Set<string>();
  const push = (d: Diagnostic) => {
    const key = `${d.file}:${d.line}:${d.column}:${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diags.push(d);
  };
  let m: RegExpExecArray | null;

  // TypeScript: src/a.ts(3,5): error TS2322: msg   |   src/a.ts:3:5 - error TS2322: msg
  for (m of out.matchAll(/^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/gm)) {
    push({ file: m[1].trim(), line: +m[2], column: +m[3], severity: m[4] as 'error', code: m[5], message: m[6], source: 'tsc' });
  }
  for (m of out.matchAll(/^(.+?):(\d+):(\d+) - (error|warning) (TS\d+): (.+)$/gm)) {
    push({ file: m[1].trim(), line: +m[2], column: +m[3], severity: m[4] as 'error', code: m[5], message: m[6], source: 'tsc' });
  }
  // Rust: error[E0308]: msg \n  --> src/main.rs:4:5
  for (m of out.matchAll(/^(error|warning)(?:\[(E\d+)\])?: (.+)\n\s+--> (.+?):(\d+):(\d+)/gm)) {
    push({ file: m[4], line: +m[5], column: +m[6], severity: m[1] as 'error', code: m[2], message: m[3], source: 'rustc' });
  }
  // gcc/clang/go/generic: file:line:col: error: msg
  for (m of out.matchAll(/^([^\s:][^:\n]*?\.[A-Za-z0-9]+):(\d+):(\d+): (?:fatal )?(error|warning): (.+)$/gm)) {
    push({ file: m[1], line: +m[2], column: +m[3], severity: m[4] as 'error', message: m[5], source: 'compiler' });
  }
  // go vet / go build: ./main.go:12:2: undefined: x
  for (m of out.matchAll(/^(\.?\/?[^\s:]+\.go):(\d+):(\d+): (.+)$/gm)) {
    push({ file: m[1].replace(/^\.\//, ''), line: +m[2], column: +m[3], severity: 'error', message: m[4], source: 'go' });
  }
  // ESLint stylish: file path line, then "  3:5  error  msg  rule"
  let currentFile: string | undefined;
  for (const line of out.split('\n')) {
    if (/^(\/|[A-Za-z]:\\|\.\/|[\w.-]+\/).+\.\w+$/.test(line.trim()) && !line.startsWith(' ')) currentFile = line.trim();
    const e = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([\w@/-]+)$/.exec(line);
    if (e && currentFile) push({ file: currentFile, line: +e[1], column: +e[2], severity: e[3] as 'error', message: e[4], code: e[5], source: 'eslint' });
  }
  // Python traceback: File "x.py", line 3 ... ErrorType: msg
  for (m of out.matchAll(/Traceback \(most recent call last\):\n([\s\S]*?)\n(\w+(?:Error|Exception|Exit)[^\n]*)/g)) {
    const frames = [...m[1].matchAll(/File "(.+?)", line (\d+)/g)];
    const last = frames[frames.length - 1];
    push({ file: last?.[1], line: last ? +last[2] : undefined, severity: 'error', message: m[2], source: 'python' });
  }
  // Python SyntaxError without traceback header
  for (m of out.matchAll(/File "(.+?)", line (\d+)\n(?:.*\n){0,3}?\s*(SyntaxError|IndentationError): (.+)/g)) {
    push({ file: m[1], line: +m[2], severity: 'error', message: `${m[3]}: ${m[4]}`, source: 'python' });
  }
  // Node.js runtime errors: "/path/file.js:12\n ... \nTypeError: msg" or stack "at fn (file:line:col)"
  for (m of out.matchAll(/^(\w*Error): (.+)\n\s+at (?:.+? \()?(.+?):(\d+):(\d+)\)?$/gm)) {
    push({ file: m[3].replace(/^file:\/\//, ''), line: +m[4], column: +m[5], severity: 'error', message: `${m[1]}: ${m[2]}`, source: 'node' });
  }
  // Assertion failures (node:assert / jest expect)
  for (m of out.matchAll(/^\s*(AssertionError(?:\s\[\w+\])?): (.+)$/gm)) {
    push({ severity: 'error', message: `${m[1]}: ${m[2]}`, source: 'assert' });
  }
  return diags.slice(0, 100);
}
