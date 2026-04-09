import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const SUITES = {
  main: {
    roots: ["tests/unit", "tests/integration", "tests/regression", "tests/ssr", "tests/utils"],
    excludePrefixes: ["stress-"],
    extraArgs: ["--test-concurrency=1"],
  },
  package: {
    roots: ["tests/package"],
    excludePrefixes: [],
    extraArgs: ["--test-concurrency=1"],
  },
  performance: {
    roots: ["tests/performance"],
    excludePrefixes: [],
    extraArgs: ["--test-concurrency=1", "--test-force-exit"],
  },
};

function collectTests(rootDir) {
  const files = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

const suiteName = process.argv[2] ?? "main";
const suite = SUITES[suiteName];
if (!suite) {
  console.error(`[stroid:test] Unknown suite '${suiteName}'. Use one of: ${Object.keys(SUITES).join(", ")}.`);
  process.exit(1);
}

const cwd = process.cwd();
const relativeTestFiles = suite.roots
  .flatMap((root) => collectTests(path.resolve(cwd, root)))
  .map((absoluteFile) => path.relative(cwd, absoluteFile))
  .filter((filePath) => {
    const fileName = path.basename(filePath);
    return !suite.excludePrefixes.some((prefix) => fileName.startsWith(prefix));
  })
  .sort();

if (relativeTestFiles.length === 0) {
  console.error(`[stroid:test] No test files found for '${suiteName}' suite.`);
  process.exit(1);
}

const nodeArgs = [
  "--import",
  "./tests/node-test-bootstrap.mjs",
  ...suite.extraArgs,
  "--test",
  ...relativeTestFiles,
];

const child = spawn(process.execPath, nodeArgs, {
  cwd,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
