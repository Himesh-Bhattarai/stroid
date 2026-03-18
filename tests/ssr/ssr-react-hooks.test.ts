/**
 * @module tests/ssr-react-hooks.test
 *
 * LAYER: Tests
 * OWNS:  SSR React hook registry coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import React from "react";
import { renderToString } from "react-dom/server";
import { createStoreForRequest } from "../../src/server/index.js";
import { useStore } from "../../src/react/index.js";
import { store } from "../../src/store.js";

test("SSR useStore resolves the active request registry without RegistryScope", () => {
    const stores = createStoreForRequest((api) => {
        api.create("session", { user: "UserA" });
    });

    const sessionStore = store<"session", { user: string }>("session");

    const App = () => {
        const user = useStore(sessionStore, "user");
        return React.createElement("span", null, user ?? "");
    };

    const html = stores.hydrate(() =>
        renderToString(React.createElement(App))
    );

    assert.ok(html.includes("UserA"));
    assert.ok(stores.registry);
});

test("concurrent SSR renders with useStore stay isolated", async () => {
    const reqA = createStoreForRequest((api) => {
        api.create("session", { user: "UserA" });
    });
    const reqB = createStoreForRequest((api) => {
        api.create("session", { user: "UserB" });
    });

    const sessionStore = store<"session", { user: string }>("session");
    const App = () => {
        const user = useStore(sessionStore, "user");
        return React.createElement("span", null, user ?? "");
    };

    const [htmlA, htmlB] = await Promise.all([
        Promise.resolve(reqA.hydrate(() => renderToString(React.createElement(App)))),
        Promise.resolve(reqB.hydrate(() => renderToString(React.createElement(App)))),
    ]);

    assert.ok(htmlA.includes("UserA"));
    assert.ok(htmlB.includes("UserB"));
    assert.ok(!htmlA.includes("UserB"));
    assert.ok(!htmlB.includes("UserA"));
});
