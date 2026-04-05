/**
 * Async fuzz tests.
 *
 * WHAT: Exercises fetchStore with randomized URL/factory/promise inputs and retry/signal variants.
 * WHY: Async boundary bugs often hide in mixed cancellation/retry/dedupe paths.
 */
import { describe, expect, it } from "vitest";
import { createStore, hasStore, setStore } from "stroid";
import { fetchStore } from "stroid/async";
import { createSeededRng } from "../shared/fuzz";

const DEFAULT_SEED = 20260404;
const RUNS = 260;
const STORE_POOL = 24;

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

describe("stress fuzz async", () => {
  it("fuzzes fetchStore under mixed async inputs without unhandled exceptions", async () => {
    const seed = Number(process.env.STROID_FUZZ_SEED ?? DEFAULT_SEED);
    const rng = createSeededRng(seed);
    // eslint-disable-next-line no-console
    console.info(`[stroid-fuzz-async] seed=${rng.seed}`);

    for (let index = 0; index < STORE_POOL; index += 1) {
      createStore(`fuzz.async.${index}`, {
        data: null,
        loading: false,
        error: null,
        status: "idle",
      });
    }

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      const roll = rng.int(0, 11);
      if (roll === 0) {
        await wait(rng.int(0, 2));
        throw new Error(`network:${url}`);
      }
      if (roll === 1) {
        return {
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          headers: { get: () => "application/json" },
          json: async () => ({ ok: false }),
          text: async () => JSON.stringify({ ok: false }),
        } as Response;
      }
      await wait(rng.int(0, 2));
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "application/json" },
        json: async () => ({ url, id: rng.int(1, 1_000_000) }),
        text: async () => JSON.stringify({ url, id: rng.int(1, 1_000_000) }),
      } as Response;
    }) as typeof fetch;

    const errors: string[] = [];

    try {
      for (let iteration = 0; iteration < RUNS; iteration += 1) {
        const name = `fuzz.async.${iteration % STORE_POOL}`;
        if (!hasStore(name)) {
          createStore(name, {
            data: null,
            loading: false,
            error: null,
            status: "idle",
          });
        }
        const controller = new AbortController();
        if ((iteration % 23) === 0 && rng.bool()) {
          controller.abort();
        }
        const inputMode = rng.int(0, 2);
        const options = {
          dedupe: false,
          ttl: rng.int(0, 10),
          retry: rng.int(0, 2),
          retryDelay: rng.int(1, 5),
          signal: controller.signal,
        };

        try {
          if (inputMode === 0) {
            await fetchStore(
              name,
              `https://fuzz.async.test/${iteration}?r=${rng.int(1, 9999)}`,
              options,
            );
          } else if (inputMode === 1) {
            await fetchStore(
              name,
              () => Promise.resolve({ mode: "factory", iteration }),
              options,
            );
          } else {
            await fetchStore(
              name,
              Promise.resolve({ mode: "promise", iteration }),
              options,
            );
          }
        } catch (error) {
          errors.push(`i=${iteration} name=${name} mode=${inputMode} err=${String(error)}`);
        }

        if ((iteration % 19) === 0) {
          setStore(name, {
            data: null,
            loading: false,
            error: null,
            status: "idle",
          });
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(errors).toEqual([]);
  });
});
