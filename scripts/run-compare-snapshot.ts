#!/usr/bin/env node

/**
 * Run the compare-state-libraries benchmark with a specified defaultSnapshotMode.
 * Usage:
 *   node --expose-gc --import tsx scripts/run-compare-snapshot.ts <mode>
 * where <mode> is one of: ref | shallow | deep
 *
 * The script configures stroid via configureStroid(...) before importing the
 * benchmark script so the benchmark runs with the chosen snapshot mode.
 */

const modeArg = process.argv[2] ?? process.env.STROID_SNAPSHOT_MODE ?? 'ref';
const mode = ['ref', 'shallow', 'deep'].includes(modeArg) ? (modeArg as 'ref' | 'shallow' | 'deep') : 'ref';

(async () => {
  try {
    // Import configureStroid from the built source (src internals). We import the TS module via tsx loader.
    const { configureStroid } = await import('../src/internals/config.js');
    console.log(`[bench-runner] Setting defaultSnapshotMode = "${mode}"`);
    configureStroid({ defaultSnapshotMode: mode });

    // Now import the benchmark script which will execute its main when imported.
    // The compare-state-libraries.ts script prints JSON results to stdout.
    await import('./compare-state-libraries.ts');
  } catch (err) {
    console.error('Failed to run benchmark:', err);
    process.exitCode = 1;
  }
})();
