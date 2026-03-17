/**
 * @module tests/ssr-carrier.test
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/ssr-carrier.test.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { getStore, setStore, setStoreBatch, subscribe } from "../../src/store.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import { createStoreForRequest } from "../../src/server/index.js";
import { configureStroid, resetConfig } from "../../src/config.js";
import { getRegistry } from "../../src/core/store-lifecycle.js";
import { fetchStore, refetchStore } from "../../src/async.js";

test("SSR Carrier perfectly isolates concurrent requests", async () => {
    resetAllStoresForTest();

    // The requests will both prepare their buffers then hydrate concurrently.
    const reqA = createStoreForRequest(({ create }) => {
        create("session", { user: "UserA" }, { lazy: false });
    });

    const reqB = createStoreForRequest(({ create }) => {
        create("session", { user: "UserB" }, { lazy: false });
    });

    // We use promises to ensure the contexts overlap in time
    const promiseA = reqA.hydrate(async () => {
        // Yield to the event loop so B can hydrate concurrently
        await new Promise(r => setTimeout(r, 20));
        
        // Assert: reqA reads ONLY reqA's data
        const readA = getStore("session");
        assert.deepStrictEqual(readA, { user: "UserA" });
        
        // Assert: setStore correctly mutates ONLY the carrier
        setStore("session", "user", "ModifiedUserA");
        const readModifiedA = getStore("session");
        assert.deepStrictEqual(readModifiedA, { user: "ModifiedUserA" });
        
        return readModifiedA;
    });

    const promiseB = reqB.hydrate(async () => {
        // Assert: reqB reads ONLY reqB's data (even while A is sleeping)
        const readB = getStore("session");
        assert.deepStrictEqual(readB, { user: "UserB" });
        return readB;
    });

    const [finalA, finalB] = await Promise.all([promiseA, promiseB]);

    assert.deepStrictEqual(finalA, { user: "ModifiedUserA" });
    assert.deepStrictEqual(finalB, { user: "UserB" });

    // THE MOST CRITICAL ASSERTION: The memory leak is dead.
    // The global registry string identifier "session" exists (created by hydrateStores)...
    // BUT the data itself never merged into the global `stores` map.
    // Wait, since both A and B hydrated, their default forms were empty or their buffer forms?
    // Let's actually check what the global fallback stores.
    // In `hydrateStores`, the first hydrate created the store with UserA. Because it executed in the carrier,
    // the value went to the carrier.
    // So `getStore("session")` without a carrier should reflect whatever the default value was,
    // or if the `buffer` was sent to `hydrateStores`, it might have initialized `initialStates` with UserA buffer.
    // It's still safe because it's just the shape, not the mutated data.
    
    // We expect the global store to NOT contain 'ModifiedUserA' or any cross-polluted data.
    const globalState = getStore("session");
    assert.ok(
        globalState == null,
        "expected no global store data after concurrent SSR requests"
    );
});

test("SSR notifications do not bleed across request registries", async () => {
    resetAllStoresForTest();

    const reqA = createStoreForRequest(({ create }) => {
        create("session", { user: "UserA" }, { lazy: false });
    });

    const reqB = createStoreForRequest(({ create }) => {
        create("session", { user: "UserB" }, { lazy: false });
    });

    const callsA: string[] = [];
    const callsB: string[] = [];

    reqA.hydrate(() => {
        subscribe("session", () => callsA.push("A"));
        setStore("session", "user", "UserA2");
    });

    reqB.hydrate(() => {
        subscribe("session", () => callsB.push("B"));
        setStore("session", "user", "UserB2");
    });

    await Promise.resolve();

    assert.deepStrictEqual(callsA, ["A"]);
    assert.deepStrictEqual(callsB, ["B"]);
});

test("setStoreBatch does not block notifications across request registries", async () => {
    resetAllStoresForTest();

    const reqA = createStoreForRequest(({ create }) => {
        create("session", { user: "UserA" }, { lazy: false });
    });

    const reqB = createStoreForRequest(({ create }) => {
        create("session", { user: "UserB" }, { lazy: false });
    });

    const callsA: string[] = [];
    const callsB: string[] = [];

    reqA.hydrate(() => {
        subscribe("session", () => callsA.push("A"));
        setStoreBatch(() => {
            setStore("session", "user", "UserA2");
            reqB.hydrate(() => {
                subscribe("session", () => callsB.push("B"));
                setStore("session", "user", "UserB2");
            });
        });
    });

    await Promise.resolve();

    assert.deepStrictEqual(callsA, ["A"]);
    assert.deepStrictEqual(callsB, ["B"]);
});

test("SSR notify orderedNames stays bounded under variable chunk sizes", async () => {
    resetAllStoresForTest();
    configureStroid({ flush: { chunkSize: 1, chunkDelayMs: 5 } });

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((res) => { resolve = res; });
        return { promise, resolve };
    };

    try {
        const reqA = createStoreForRequest(({ create }) => {
            create("a1", { value: 0 }, { lazy: false });
            create("a2", { value: 0 }, { lazy: false });
            create("a3", { value: 0 }, { lazy: false });
        });

        const reqB = createStoreForRequest(({ create }) => {
            create("b1", { value: 0 }, { lazy: false });
            create("b2", { value: 0 }, { lazy: false });
        });

        const lengthsA: number[] = [];
        const lengthsB: number[] = [];
        const firstCycleDone = deferred();
        const secondCycleStart = deferred();
        let finishedFirst = 0;

        const markFirstCycle = () => {
            finishedFirst += 1;
            if (finishedFirst === 2) firstCycleDone.resolve();
        };

        const promiseA = reqA.hydrate(async () => {
            subscribe("a1", () => {});
            subscribe("a2", () => {});
            subscribe("a3", () => {});

            setStore("a1", "value", 1);
            setStore("a2", "value", 1);
            setStore("a3", "value", 1);

            await wait(40);
            lengthsA.push(getRegistry().notify.orderedNames.length);
            markFirstCycle();

            await secondCycleStart.promise;

            setStore("a1", "value", 2);
            await wait(40);
            lengthsA.push(getRegistry().notify.orderedNames.length);
        });

        const promiseB = reqB.hydrate(async () => {
            subscribe("b1", () => {});
            subscribe("b2", () => {});

            setStore("b1", "value", 1);
            setStore("b2", "value", 1);

            await wait(40);
            lengthsB.push(getRegistry().notify.orderedNames.length);
            markFirstCycle();

            await secondCycleStart.promise;

            setStore("b1", "value", 2);
            await wait(40);
            lengthsB.push(getRegistry().notify.orderedNames.length);
        });

        await firstCycleDone.promise;
        configureStroid({ flush: { chunkSize: 2, chunkDelayMs: 5 } });
        secondCycleStart.resolve();

        await Promise.all([promiseA, promiseB]);

        assert.ok(lengthsA[0] <= 3, `reqA orderedNames too large: ${lengthsA[0]}`);
        assert.ok(lengthsA[1] <= 1, `reqA orderedNames should shrink: ${lengthsA[1]}`);
        assert.ok(lengthsB[0] <= 2, `reqB orderedNames too large: ${lengthsB[0]}`);
        assert.ok(lengthsB[1] <= 1, `reqB orderedNames should shrink: ${lengthsB[1]}`);
    } finally {
        resetConfig();
    }
});

test("SSR async registries isolate fetch registry and cache meta", async () => {
    resetAllStoresForTest();

    const reqA = createStoreForRequest(({ create }) => {
        create("asyncScoped", {
            data: null,
            loading: false,
            error: null,
            status: "idle",
        }, { lazy: false });
    });

    const reqB = createStoreForRequest(({ create }) => {
        create("asyncScoped", {
            data: null,
            loading: false,
            error: null,
            status: "idle",
        }, { lazy: false });
    });

    await reqA.hydrate(async () => {
        await fetchStore("asyncScoped", () => Promise.resolve({ value: "a" }));
    });

    const resultB = await reqB.hydrate(() => refetchStore("asyncScoped"));
    assert.strictEqual(resultB, undefined);
});

test("SSR notifications remain isolated under overlapping writes", async () => {
    resetAllStoresForTest();

    const reqA = createStoreForRequest(({ create }) => {
        create("session", { user: "UserA" }, { lazy: false });
    });

    const reqB = createStoreForRequest(({ create }) => {
        create("session", { user: "UserB" }, { lazy: false });
    });

    const callsA: string[] = [];
    const callsB: string[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const promiseA = reqA.hydrate(async () => {
        subscribe("session", () => callsA.push(String(getStore("session")?.user)));
        setStore("session", "user", "UserA1");
        await wait(15);
        setStore("session", "user", "UserA2");
    });

    const promiseB = reqB.hydrate(async () => {
        subscribe("session", () => callsB.push(String(getStore("session")?.user)));
        await wait(5);
        setStore("session", "user", "UserB1");
    });

    await Promise.all([promiseA, promiseB]);
    await wait(20);

    assert.ok(callsA.length > 0);
    assert.ok(callsB.length > 0);
    assert.ok(callsA.every((value) => value.startsWith("UserA")));
    assert.ok(callsB.every((value) => value.startsWith("UserB")));
});

test("concurrent setStoreBatch across request registries stays isolated", async () => {
    resetAllStoresForTest();

    const reqA = createStoreForRequest(({ create }) => {
        create("session", { user: "UserA" }, { lazy: false });
    });

    const reqB = createStoreForRequest(({ create }) => {
        create("session", { user: "UserB" }, { lazy: false });
    });

    const callsA: string[] = [];
    const callsB: string[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const promiseA = reqA.hydrate(async () => {
        subscribe("session", () => callsA.push(String(getStore("session")?.user)));
        await wait(10);
        setStoreBatch(() => {
            setStore("session", "user", "UserA1");
        });
    });

    const promiseB = reqB.hydrate(async () => {
        subscribe("session", () => callsB.push(String(getStore("session")?.user)));
        setStoreBatch(() => {
            setStore("session", "user", "UserB1");
        });
    });

    await Promise.all([promiseA, promiseB]);
    await wait(20);

    assert.ok(callsA.length > 0);
    assert.ok(callsB.length > 0);
    assert.ok(callsA.every((value) => value.startsWith("UserA")));
    assert.ok(callsB.every((value) => value.startsWith("UserB")));
});


