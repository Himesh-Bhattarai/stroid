import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const src = (...segments: string[]) => path.resolve(rootDir, "src", ...segments);
const stressAliases = [
    { find: /^stroid$/, replacement: src("index.ts") },
    { find: /^stroid\/async$/, replacement: src("async.ts") },
    { find: /^stroid\/computed$/, replacement: src("computed", "index.ts") },
    { find: /^stroid\/core$/, replacement: src("core", "index.ts") },
    { find: /^stroid\/devtools$/, replacement: src("devtools", "index.ts") },
    { find: /^stroid\/feature$/, replacement: src("feature.ts") },
    { find: /^stroid\/helpers$/, replacement: src("helpers", "index.ts") },
    { find: /^stroid\/install$/, replacement: src("install.ts") },
    { find: /^stroid\/persist$/, replacement: src("persist.ts") },
    { find: /^stroid\/psr$/, replacement: src("psr", "index.ts") },
    { find: /^stroid\/query$/, replacement: src("query.ts") },
    { find: /^stroid\/react$/, replacement: src("react", "index.ts") },
    { find: /^stroid\/runtime-admin$/, replacement: src("runtime-admin", "index.ts") },
    { find: /^stroid\/runtime-tools$/, replacement: src("runtime-tools", "index.ts") },
    { find: /^stroid\/selectors$/, replacement: src("selectors", "index.ts") },
    { find: /^stroid\/server$/, replacement: src("server", "index.ts") },
    { find: /^stroid\/server\/portable$/, replacement: src("server", "portable.ts") },
    { find: /^stroid\/sync$/, replacement: src("sync.ts") },
    { find: /^stroid\/testing$/, replacement: src("helpers", "testing.ts") },
];

export default defineConfig({
    resolve: {
        alias: stressAliases,
    },
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "react",
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./tests/vitest.setup.ts"],
        include: [
            "tests/unit/stress-*.test.ts",
            "tests/concurrency/**/*.test.ts",
            "tests/concurrency/**/*.test.tsx",
            "tests/persistence/**/*.test.ts",
            "tests/sync/**/*.test.ts",
            "tests/hooks/**/*.test.ts",
            "tests/hooks/**/*.test.tsx",
            "tests/fuzz/**/*.test.ts",
            "tests/fuzz/**/*.test.tsx",
            "tests/regression/stress-*.test.ts",
        ],
        coverage: {
            provider: "v8",
            reportsDirectory: "coverage/stress",
            reporter: ["text-summary", "json-summary", "lcov"],
        },
    },
});
