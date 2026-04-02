import { runAtomicFailureBenchmark } from "./atomic-failure-benchmark.js";
import { emitReport, isMainModule, maybeGc } from "./benchmark-guarantee-utils.js";
import { runDeterminismReplayBenchmark } from "./determinism-replay-benchmark.js";
import { runGovernanceLifecycleBenchmark } from "./governance-lifecycle-benchmark.js";
import { runHydrationDivergenceBenchmark } from "./hydration-divergence-benchmark.js";
import { runHydrationRandomizedBenchmark } from "./hydration-randomized-benchmark.js";
import { runMemoryLeakBenchmark } from "./memory-leak-benchmark.js";
import { runRaceConditionBenchmark } from "./race-condition-benchmark.js";
import { runReactConcurrencyBenchmark } from "./react-concurrency-benchmark.js";
import { runServerlessProviderCertification } from "./serverless-provider-certification.js";
import { runSsrIsolationBenchmark } from "./ssr-isolation-benchmark.js";
import { runSsrWarmContainerBenchmark } from "./ssr-warm-container-benchmark.js";

export const runGuaranteeBenchmarkSuite = async () => {
  const results = [];

  for (const run of [
    runSsrIsolationBenchmark,
    runSsrWarmContainerBenchmark,
    runServerlessProviderCertification,
    runReactConcurrencyBenchmark,
    runAtomicFailureBenchmark,
    runRaceConditionBenchmark,
    runHydrationDivergenceBenchmark,
    runHydrationRandomizedBenchmark,
    runDeterminismReplayBenchmark,
    runMemoryLeakBenchmark,
    runGovernanceLifecycleBenchmark,
  ]) {
    results.push(await run());
    maybeGc();
  }

  return {
    suite: "guarantee-benchmarks",
    results,
  };
};

const main = async () => {
  const result = await runGuaranteeBenchmarkSuite();
  emitReport({
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    ...result,
  });
};

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
