import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const targets = ["dist/index.d.ts", "dist/index.d.cts"];
const patterns = [
  { label: "react import", regex: /from\s+[\"']react[\"']/ },
  { label: "React namespace", regex: /\bReact\./ },
  { label: "JSX namespace", regex: /\bJSX\b/ },
];

let failed = false;
for (const target of targets) {
  const fullPath = resolve(target);
  if (!existsSync(fullPath)) {
    console.error(`[stroid] Missing type output: ${target}. Run npm run build first.`);
    failed = true;
    continue;
  }

  const text = readFileSync(fullPath, "utf8");
  for (const { label, regex } of patterns) {
    if (regex.test(text)) {
      console.error(`[stroid] React types leaked into ${target} (${label}).`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("[stroid] PASS: main bundle types are React-free.");
