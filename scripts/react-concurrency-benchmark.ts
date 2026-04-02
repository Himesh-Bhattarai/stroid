import { performance } from "node:perf_hooks";
import { JSDOM } from "jsdom";
import { cleanup } from "@testing-library/react";
import {
  emitReport,
  isMainModule,
  maybeGc,
  round,
  summarizeSamples,
} from "./benchmark-guarantee-utils.js";
import {
  runDeferredScenario,
  runTransitionScenario,
} from "./react-concurrency-shared.js";

type ScenarioResult = {
  scenario: "useTransition" | "useDeferredValue";
  runs: number;
  updatesPerRun: number;
  timing: ReturnType<typeof summarizeSamples>;
  averageRenders: number;
  invariantViolations: number;
  sampleFinalState: unknown;
};

type BenchmarkResult = {
  name: string;
  scenarios: ScenarioResult[];
};

const RUNS = Number(process.env.STROID_REACT_CONCURRENCY_RUNS ?? 8);
const UPDATES = Number(process.env.STROID_REACT_CONCURRENCY_UPDATES ?? 24);

const bootstrapDom = (): void => {
  if (typeof (globalThis as any).window !== "undefined" && typeof (globalThis as any).document !== "undefined") {
    return;
  }

  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  const { window } = dom;
  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).Node = window.Node;
  (globalThis as any).Element = window.Element;
  (globalThis as any).Text = window.Text;
  (globalThis as any).Event = window.Event;
  (globalThis as any).CustomEvent = window.CustomEvent;
  (globalThis as any).MutationObserver = window.MutationObserver;
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      value: window.navigator,
      configurable: true,
    });
  }
  (globalThis as any).getComputedStyle = window.getComputedStyle.bind(window);
  (globalThis as any).requestAnimationFrame = window.requestAnimationFrame?.bind(window)
    ?? ((callback: FrameRequestCallback) => setTimeout(callback, 0));
  (globalThis as any).cancelAnimationFrame = window.cancelAnimationFrame?.bind(window)
    ?? ((id: number) => clearTimeout(id));
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
};

const measureScenario = async (args: {
  scenario: ScenarioResult["scenario"];
  run: (options: { updates: number }) => Promise<{
    renders: number;
    invariantViolations: string[];
    finalState: unknown;
  }>;
}): Promise<ScenarioResult> => {
  const durations: number[] = [];
  let totalRenders = 0;
  let invariantViolations = 0;
  let sampleFinalState: unknown = null;

  for (let runIndex = 0; runIndex < RUNS; runIndex += 1) {
    maybeGc();
    const startedAt = performance.now();
    const result = await args.run({ updates: UPDATES });
    durations.push(round(performance.now() - startedAt));
    totalRenders += result.renders;
    invariantViolations += result.invariantViolations.length;

    if (sampleFinalState === null) {
      sampleFinalState = result.finalState;
    }
  }

  cleanup();

  if (invariantViolations !== 0) {
    throw new Error(`${args.scenario} saw ${invariantViolations} invariant violation(s)`);
  }

  return {
    scenario: args.scenario,
    runs: RUNS,
    updatesPerRun: UPDATES,
    timing: summarizeSamples(durations),
    averageRenders: round(totalRenders / RUNS),
    invariantViolations,
    sampleFinalState,
  };
};

export const runReactConcurrencyBenchmark = async (): Promise<BenchmarkResult> => {
  bootstrapDom();

  return {
    name: "React 18 Concurrency Certification",
    scenarios: [
      await measureScenario({
        scenario: "useTransition",
        run: runTransitionScenario,
      }),
      await measureScenario({
        scenario: "useDeferredValue",
        run: runDeferredScenario,
      }),
    ],
  };
};

const main = async () => {
  const result = await runReactConcurrencyBenchmark();
  emitReport({
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    result,
  });
};

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
