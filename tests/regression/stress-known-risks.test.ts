/**
 * Regression tests for documented risk areas.
 *
 * WHAT: Locks behavior around clock-skew sync conflicts, broad useStore warnings, subpath import side effects, and missing devtools.
 * WHY: These areas have explicit design caveats and are likely to regress during refactors.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, getStore, setStore } from "stroid";
import { useStore } from "stroid/react";
import { flushMicrotasks, installMockBroadcastChannel, MockBroadcastChannel } from "../shared/mocks";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("stress regressions", () => {
    it("documents clock-skew limitation: timestamp-trusting conflict resolver favors skewed incoming writes", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();

        createStore("reg.clock", { value: "local" }, {
            sync: {
                policy: "insecure",
                channel: "reg.clock.channel",
                checksum: "none",
                // Intentionally timestamp-driven to model documented skew risk.
                conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }) =>
                    incomingUpdated > localUpdated ? incoming : local,
            },
        });

        const peer = new MockBroadcastChannel("reg.clock.channel");
        peer.postMessage({
            v: 1,
            protocol: 1,
            type: "sync-state",
            name: "reg.clock",
            source: "future-tab",
            clock: 1,
            updatedAt: Date.now() + 5000,
            data: { value: "future" },
            checksum: 0,
        });
        await flushMicrotasks(8);

        expect(getStore("reg.clock")).toEqual({ value: "future" });
    });

    it("keeps broad useStore warning and shows extra re-renders on unrelated updates", async () => {
        createStore("reg.broad", { a: 1, b: 1 });
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        let renders = 0;

        const Probe = () => {
            useStore("reg.broad");
            renders += 1;
            return null;
        };

        render(createElement(Probe));
        setStore("reg.broad", "b", 2);
        setStore("reg.broad", "b", 3);
        setStore("reg.broad", "b", 4);
        await flushMicrotasks(6);

        expect(renders).toBeGreaterThanOrEqual(2);
        expect(warnSpy.mock.calls.some((call) =>
            String(call[0]).includes("entire store")
        )).toBe(true);
    });

    it("subpath imports do not trigger side effects from other entrypoints", () => {
        const coreEntry = path.resolve(repoRoot, "src/core/index.ts");
        const reactEntry = path.resolve(repoRoot, "src/react/index.ts");
        const asyncEntry = path.resolve(repoRoot, "src/async.ts");

        const script = `
            const assert = (await import("node:assert")).default;
            const { pathToFileURL } = await import("node:url");

            let devtoolsReads = 0;
            globalThis.window = {
              get __REDUX_DEVTOOLS_EXTENSION__() {
                devtoolsReads += 1;
                return undefined;
              },
              addEventListener() {},
              removeEventListener() {},
            };

            await import(pathToFileURL(${JSON.stringify(coreEntry)}).href);
            await import(pathToFileURL(${JSON.stringify(asyncEntry)}).href);
            await import(pathToFileURL(${JSON.stringify(reactEntry)}).href);

            assert.strictEqual(devtoolsReads, 0, "subpath import should not auto-initialize devtools bridge");
        `;

        const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
            cwd: repoRoot,
            encoding: "utf8",
            env: { ...process.env, NODE_ENV: "test" },
        });
        if (result.status !== 0) {
            throw new Error(`subpath import isolation subprocess failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
        }
        expect(result.status).toBe(0);
    }, 20000);

    it("devtools bridge does not throw when Redux DevTools extension is missing", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        createStore("reg.devtools", { value: 1 }, { devtools: true });
        expect(() => {
            setStore("reg.devtools", { value: 2 });
        }).not.toThrow();
        expect(getStore("reg.devtools")).toEqual({ value: 2 });
        expect(warnSpy).toHaveBeenCalled();
    });
});
