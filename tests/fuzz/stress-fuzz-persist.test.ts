/**
 * Persist fuzz tests.
 *
 * WHAT: Randomizes persist driver behavior (sync/async failures, evictions, races) under repeated writes.
 * WHY: Persistence failures are production-critical and need adversarial, replayable stress coverage.
 */
import { describe, expect, it } from "vitest";
import { createStore, deleteStore, getStore, hasStore, setStore } from "stroid";
import { createSeededRng } from "../shared/fuzz";

const DEFAULT_SEED = 20260405;
const STORE_POOL = 18;
const WRITES = 220;

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

describe("stress fuzz persist", () => {
  it("fuzzes persist failure modes without crashing store operations", async () => {
    const seed = Number(process.env.STROID_FUZZ_SEED ?? DEFAULT_SEED);
    const rng = createSeededRng(seed);
    // eslint-disable-next-line no-console
    console.info(`[stroid-fuzz-persist] seed=${rng.seed}`);

    const errors: string[] = [];
    const onErrorMessages: string[] = [];

    const drivers = Array.from({ length: STORE_POOL }, (_value, index) => {
      const storage = new Map<string, string>();
      let seq = 0;
      return {
        key: `fuzz.persist.key.${index}`,
        driver: {
          getItem: async (key: string) => {
            if ((seq % 29) === 0 && rng.bool()) {
              // Simulate storage eviction.
              storage.delete(key);
            }
            await wait(rng.int(0, 2));
            return storage.get(key) ?? null;
          },
          setItem: async (key: string, value: string) => {
            seq += 1;
            const roll = rng.int(0, 39);
            if (roll === 0) {
              const error = new Error("QuotaExceededError");
              error.name = "QuotaExceededError";
              throw error;
            }
            if (roll === 1) {
              throw new Error("transient storage write failure");
            }
            await wait(rng.int(0, 3));
            storage.set(key, value);
          },
          removeItem: async (key: string) => {
            storage.delete(key);
          },
        },
        storage,
      };
    });

    for (let index = 0; index < STORE_POOL; index += 1) {
      createStore(`fuzz.persist.${index}`, { version: 0, payload: "seed" }, {
        persist: {
          driver: drivers[index]!.driver,
          key: drivers[index]!.key,
          encrypt: (value: string) => value,
          decrypt: (value: string) => value,
          allowPlaintext: true,
          checksum: "none",
        },
        onError: (message) => {
          onErrorMessages.push(message);
        },
      });
    }

    for (let iteration = 0; iteration < WRITES; iteration += 1) {
      const target = iteration % STORE_POOL;
      const name = `fuzz.persist.${target}`;
      try {
        if (!hasStore(name)) {
          createStore(name, { version: 0, payload: "recreated" }, {
            persist: {
              driver: drivers[target]!.driver,
              key: drivers[target]!.key,
              encrypt: (value: string) => value,
              decrypt: (value: string) => value,
              allowPlaintext: true,
              checksum: "none",
            },
          });
        }

        const payloadSize = rng.int(20, 1200);
        setStore(name, {
          version: iteration + 1,
          payload: `${"x".repeat(payloadSize)}-${iteration}`,
        });

        if ((iteration % 17) === 0) {
          // Simulate page/session eviction + recreation flow.
          deleteStore(name);
          createStore(name, { version: -1, payload: "reloaded" }, {
            persist: {
              driver: drivers[target]!.driver,
              key: drivers[target]!.key,
              encrypt: (value: string) => value,
              decrypt: (value: string) => value,
              allowPlaintext: true,
              checksum: "none",
            },
            onError: (message) => {
              onErrorMessages.push(message);
            },
          });
        }
      } catch (error) {
        errors.push(`i=${iteration} store=${name} err=${String(error)}`);
      }

      if ((iteration % 20) === 0) {
        await wait(0);
      }
    }

    await wait(40);

    const stateShapeErrors: string[] = [];
    for (let index = 0; index < STORE_POOL; index += 1) {
      const snapshot = getStore(`fuzz.persist.${index}`) as { version?: unknown; payload?: unknown } | null;
      if (snapshot == null || typeof snapshot !== "object") {
        stateShapeErrors.push(`store=fuzz.persist.${index} missing snapshot`);
        continue;
      }
      if (typeof snapshot.payload !== "string") {
        stateShapeErrors.push(`store=fuzz.persist.${index} payload-type=${typeof snapshot.payload}`);
      }
    }

    expect(errors).toEqual([]);
    expect(stateShapeErrors).toEqual([]);
    expect(onErrorMessages.every((message) => typeof message === "string" && message.length > 0)).toBe(true);
  });
});
