import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        core: "src/core.ts",
        async: "src/async.ts",
        react: "src/hooks-core.ts",
        testing: "src/testing.ts",
    },
    format: ["esm"],
    dts: true,
    minify: true,
    treeshake: true,
    sourcemap: false,
    clean: true,
    splitting: true,
    drop: ["debugger"],
});
