import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
