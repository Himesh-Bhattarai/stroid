/**
 * Seeded fuzz tests.
 *
 * WHAT: Sends randomized inputs through createStore, setStore, and useStore in deterministic batches.
 * WHY: Fuzzing finds parser/sanitizer/runtime edge cases that static hand-written tests miss.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createStore, hasStore, setStore } from "stroid";
import { useStore } from "stroid/react";
import {
    createSeededRng,
    randomCreateStoreOptions,
    randomJsonLike,
    randomStoreKey,
} from "../shared/fuzz";

const DEFAULT_SEED = 20260403;
const RUNS_PER_SURFACE = 500;

describe("stress fuzz", () => {
    it("fuzzes createStore / setStore / useStore without unhandled exceptions", () => {
        const seed = Number(process.env.STROID_FUZZ_SEED ?? DEFAULT_SEED);
        const rng = createSeededRng(seed);
        // Keep seed visible in CI logs for exact replay.
        // eslint-disable-next-line no-console
        console.info(`[stroid-fuzz] seed=${rng.seed}`);

        const createStoreErrors: string[] = [];
        const setStoreErrors: string[] = [];
        const useStoreErrors: string[] = [];

        for (let i = 0; i < RUNS_PER_SURFACE; i += 1) {
            const key = String(randomStoreKey(rng) ?? `fuzz.create.${i}`);
            const value = randomJsonLike(rng);
            const options = randomCreateStoreOptions(rng);
            try {
                createStore(key, value as never, options as never);
            } catch (err) {
                createStoreErrors.push(`i=${i} key=${key} err=${String(err)}`);
            }
        }

        for (let i = 0; i < RUNS_PER_SURFACE; i += 1) {
            const key = String(randomStoreKey(rng) ?? `fuzz.set.${i}`);
            if (!hasStore(key)) {
                createStore(key, { value: 0, nested: { x: 1 } });
            }
            const mode = rng.int(0, 3);
            try {
                if (mode === 0) {
                    setStore(key, randomJsonLike(rng) as never);
                } else if (mode === 1) {
                    setStore(key, ((draft: unknown) => {
                        if (draft && typeof draft === "object") {
                            (draft as Record<string, unknown>).value = randomJsonLike(rng);
                        }
                    }) as never);
                } else if (mode === 2) {
                    setStore(key, ["nested", "x"], rng.int(-1000, 1000));
                } else {
                    setStore(key, Number.NaN as never);
                }
            } catch (err) {
                setStoreErrors.push(`i=${i} key=${key} mode=${mode} err=${String(err)}`);
            }
        }

        const HookProbe = ({
            name,
            selector,
        }: {
            name: string;
            selector?: ((value: unknown) => unknown) | undefined;
        }) => {
            if (selector) {
                useStore(name, selector);
            } else {
                useStore(name);
            }
            return null;
        };

        const selectorPool: Array<(value: unknown) => unknown> = [
            (value) => value,
            (value) => (value && typeof value === "object" ? (value as Record<string, unknown>).value : value),
            (value) => (Array.isArray(value) ? value.length : typeof value),
            () => "constant",
        ];

        for (let i = 0; i < RUNS_PER_SURFACE; i += 1) {
            const key = String(randomStoreKey(rng) ?? `fuzz.hook.${i}`);
            const selector = rng.bool() ? selectorPool[rng.int(0, selectorPool.length - 1)] : undefined;
            try {
                const ui = render(<HookProbe name={key} selector={selector} />);
                ui.unmount();
            } catch (err) {
                useStoreErrors.push(`i=${i} key=${key} err=${String(err)}`);
            }
        }

        expect(createStoreErrors).toEqual([]);
        expect(setStoreErrors).toEqual([]);
        expect(useStoreErrors).toEqual([]);
    });
});

