/**
 * Shared setup for the stress-oriented Vitest suite.
 *
 * WHAT: Installs browser-like test globals, built-in feature runtimes, and deterministic teardown.
 * WHY: These stress tests intentionally hammer global registries and feature state; without hard resets
 * they can leak subscriptions/cache entries and produce flaky CI results.
 */
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";
import { installDevtools } from "stroid/devtools";
import { installPersist } from "stroid/persist";
import { installSync } from "stroid/sync";
import { resetAllStoresForTest } from "stroid/testing";

declare global {
    // eslint-disable-next-line no-var
    var __STROID_DEV__: boolean | undefined;
}

beforeAll(() => {
    globalThis.__STROID_DEV__ = true;
    if (typeof process !== "undefined" && process.env.NODE_ENV == null) {
        process.env.NODE_ENV = "test";
    }
    console.log = () => {};

    // Feature runtimes are opt-in. Install once for the stress suite.
    installPersist();
    installSync();
    installDevtools();
});

afterEach(() => {
    cleanup();
    resetAllStoresForTest();
    vi.restoreAllMocks();
    vi.useRealTimers();
});
