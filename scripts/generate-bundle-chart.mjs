/**
 * Bundle-closure size chart generator for public entrypoints.
 *
 * This measures "what a consumer pays" when bundling a small app entry
 * that imports ONE representative symbol from each `stroid/*` subpath.
 *
 * Notes:
 * - We measure the built `dist/` output (via self-referential package imports).
 * - React is treated as external (peer dependency) so it doesn't pollute numbers.
 * - Output is minified ESM, plus gzip/brotli sizes.
 */

import * as esbuild from "esbuild";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import process from "node:process";

const KB = 1024;
const formatKiB = (bytes) => `${(bytes / KB).toFixed(1)} KiB`;

const EXTERNAL = [
  "react",
  "react-dom",
  "react-dom/client",
  "react-dom/server",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
];

/**
 * @type {Array<{ entrypoint: string; symbol: string; platform: "browser" | "node"; note?: string }>}
 */
const PROBES = [
  { entrypoint: "stroid", symbol: "createStore", platform: "browser" },
  { entrypoint: "stroid/core", symbol: "createStore", platform: "browser" },
  { entrypoint: "stroid/psr", symbol: "getTimingContract", platform: "browser" },
  { entrypoint: "stroid/query", symbol: "reactQueryKey", platform: "browser" },
  { entrypoint: "stroid/runtime-tools", symbol: "listStores", platform: "browser" },
  { entrypoint: "stroid/runtime-admin", symbol: "clearAllStores", platform: "browser" },
  { entrypoint: "stroid/selectors", symbol: "createSelector", platform: "browser" },
  { entrypoint: "stroid/computed", symbol: "createComputed", platform: "browser" },
  { entrypoint: "stroid/helpers", symbol: "createCounterStore", platform: "browser" },
  { entrypoint: "stroid/async", symbol: "fetchStore", platform: "browser" },
  { entrypoint: "stroid/persist", symbol: "installPersist", platform: "browser" },
  { entrypoint: "stroid/sync", symbol: "installSync", platform: "browser" },
  { entrypoint: "stroid/devtools", symbol: "installDevtools", platform: "browser" },
  { entrypoint: "stroid/feature", symbol: "registerStoreFeature", platform: "browser" },
  { entrypoint: "stroid/install", symbol: "installAllFeatures", platform: "browser" },
  { entrypoint: "stroid/react", symbol: "useStore", platform: "browser", note: "react external" },
  { entrypoint: "stroid/testing", symbol: "resetAllStoresForTest", platform: "browser" },
  { entrypoint: "stroid/server/portable", symbol: "createRequestScope", platform: "browser" },
  { entrypoint: "stroid/server", symbol: "createStoreForRequest", platform: "node", note: "node-only" },
];

const bundleProbe = async ({ entrypoint, symbol, platform }) => {
  const contents = `import { ${symbol} } from ${JSON.stringify(entrypoint)};\nexport { ${symbol} };`;
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    bundle: true,
    format: "esm",
    target: "es2020",
    platform,
    minify: true,
    treeShaking: true,
    legalComments: "none",
    sourcemap: false,
    write: false,
    logLevel: "silent",
    external: EXTERNAL,
    stdin: {
      contents,
      resolveDir: process.cwd(),
      sourcefile: `${entrypoint.replace(/\//g, "_")}.probe.ts`,
      loader: "ts",
    },
  });

  const combined = Buffer.concat(result.outputFiles.map((file) => Buffer.from(file.contents)));
  const minifiedBytes = combined.length;
  const gzipBytes = gzipSync(combined, { level: 9 }).length;
  const brotliBytes = brotliCompressSync(combined, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
    },
  }).length;

  return { minifiedBytes, gzipBytes, brotliBytes };
};

const renderBar = (valueKiB, maxKiB) => {
  const width = 28;
  if (!Number.isFinite(maxKiB) || maxKiB <= 0) return "";
  const filled = Math.max(0, Math.min(width, Math.round((valueKiB / maxKiB) * width)));
  return `${"#".repeat(filled)}${" ".repeat(width - filled)}`;
};

const main = async () => {
  /** @type {Array<{ entrypoint: string; symbol: string; platform: string; minifiedBytes?: number; gzipBytes?: number; brotliBytes?: number; note?: string; error?: string }>} */
  const rows = [];

  for (const probe of PROBES) {
    try {
      const size = await bundleProbe(probe);
      rows.push({
        entrypoint: probe.entrypoint,
        symbol: probe.symbol,
        platform: probe.platform,
        ...size,
        note: probe.note,
      });
    } catch (err) {
      rows.push({
        entrypoint: probe.entrypoint,
        symbol: probe.symbol,
        platform: probe.platform,
        note: probe.note,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okRows = rows.filter((row) => !row.error && typeof row.gzipBytes === "number");
  const maxGzipKiB = okRows.length > 0
    ? Math.max(...okRows.map((row) => row.gzipBytes / KB))
    : 0;

  const header = [
    "# Bundle Size Chart",
    "",
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    `Node: ${process.version} (${process.platform} ${process.arch})`,
    `esbuild: ${esbuild.version}`,
    "",
    "Method:",
    "- Built `dist/` output (self-import via package `exports`).",
    "- Bundled with esbuild as minified ESM (`target=es2020`).",
    "- Reported as bundle-closure size (what gets pulled into an app bundle).",
    "- `react` and `react-dom` are externalized (peer deps).",
    "",
    "Table:",
    "",
    "| Entrypoint | Probe | Platform | Minified | Gzip | Brotli | Notes |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
  ].join("\n");

  const tableLines = rows.map((row) => {
    if (row.error) {
      const msg = row.error.replace(/\s+/g, " ").slice(0, 120);
      return `| \`${row.entrypoint}\` | \`${row.symbol}\` | \`${row.platform}\` | - | - | - | ERROR: ${msg} |`;
    }
    const note = row.note ?? "";
    return `| \`${row.entrypoint}\` | \`${row.symbol}\` | \`${row.platform}\` | ${formatKiB(row.minifiedBytes)} | ${formatKiB(row.gzipBytes)} | ${formatKiB(row.brotliBytes)} | ${note} |`;
  });

  const visualHeader = [
    "",
    "Visual (gzip):",
    "",
    "```text",
  ].join("\n");

  const visualLines = okRows
    .slice()
    .sort((a, b) => (b.gzipBytes ?? 0) - (a.gzipBytes ?? 0))
    .map((row) => {
      const gzipKiB = row.gzipBytes / KB;
      const bar = renderBar(gzipKiB, maxGzipKiB);
      const label = row.entrypoint.padEnd(22, " ");
      const size = formatKiB(row.gzipBytes).padStart(10, " ");
      return `${label} ${size}  ${bar}`;
    });

  const footer = [
    "```",
    "",
    "Notes:",
    "- These are *import-closure* sizes, not the size of `dist/*.js` files.",
    "- The exact number varies with bundler settings; treat this as a consistent local baseline.",
    "",
  ].join("\n");

  const md = [header, ...tableLines, visualHeader, ...visualLines, footer].join("\n");
  await writeFile("CHART.md", md, "utf8");
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

