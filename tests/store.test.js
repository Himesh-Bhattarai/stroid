// ─────────────────────────────────────────────
// stroid/tests/store.test.js
// Run with: npm test
// ─────────────────────────────────────────────

import {
    createStore,
    setStore,
    getStore,
    deleteStore,
    resetStore,
    mergeStore,
    hasStore,
    listStores,
    clearAllStores,
} from "../src/store.js";

// reset between tests
beforeEach(() => clearAllStores());

// ── createStore ───────────────────────────────
describe("createStore", () => {
    test("creates a store with object data", () => {
        createStore("user", { name: "Alex", age: 25 });
        expect(getStore("user")).toEqual({ name: "Alex", age: 25 });
    });

    test("creates a store with number", () => {
        createStore("count", 0);
        expect(getStore("count")).toBe(0);
    });

    test("creates a store with array", () => {
        createStore("tags", ["react", "js"]);
        expect(getStore("tags")).toEqual(["react", "js"]);
    });

    test("creates a store with string", () => {
        createStore("theme", "dark");
        expect(getStore("theme")).toBe("dark");
    });

    test("rejects function data", () => {
        const result = createStore("fn", () => { });
        expect(result).toBeUndefined();
        expect(hasStore("fn")).toBe(false);
    });
});

// ── setStore ──────────────────────────────────
describe("setStore", () => {
    test("updates a single field", () => {
        createStore("user", { name: "Alex", age: 25 });
        setStore("user", "name", "Jordan");
        expect(getStore("user", "name")).toBe("Jordan");
        expect(getStore("user", "age")).toBe(25); // unchanged
    });

    test("updates with dot notation", () => {
        createStore("user", { profile: { color: "blue" } });
        setStore("user", "profile.color", "red");
        expect(getStore("user", "profile.color")).toBe("red");
    });

    test("updates with full object", () => {
        createStore("user", { name: "Alex", age: 25 });
        setStore("user", { name: "Jordan" });
        expect(getStore("user", "name")).toBe("Jordan");
        expect(getStore("user", "age")).toBe(25); // merges, not replaces
    });

    test("warns when store doesn't exist", () => {
        const spy = jest.spyOn(console, "error").mockImplementation(() => { });
        setStore("ghost", "name", "Alex");
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ── getStore ──────────────────────────────────
describe("getStore", () => {
    test("gets whole store", () => {
        createStore("user", { name: "Alex" });
        expect(getStore("user")).toEqual({ name: "Alex" });
    });

    test("gets specific field", () => {
        createStore("user", { name: "Alex", age: 25 });
        expect(getStore("user", "name")).toBe("Alex");
    });

    test("gets nested field with dot notation", () => {
        createStore("user", { profile: { city: "Kathmandu" } });
        expect(getStore("user", "profile.city")).toBe("Kathmandu");
    });

    test("returns null for missing store", () => {
        const spy = jest.spyOn(console, "error").mockImplementation(() => { });
        expect(getStore("ghost")).toBeNull();
        spy.mockRestore();
    });
});

// ── resetStore ────────────────────────────────
describe("resetStore", () => {
    test("resets back to initial value", () => {
        createStore("user", { name: "Alex" });
        setStore("user", "name", "Jordan");
        expect(getStore("user", "name")).toBe("Jordan");
        resetStore("user");
        expect(getStore("user", "name")).toBe("Alex");
    });
});

// ── mergeStore ────────────────────────────────
describe("mergeStore", () => {
    test("adds new fields without removing old ones", () => {
        createStore("user", { name: "Alex" });
        mergeStore("user", { role: "admin" });
        expect(getStore("user")).toEqual({ name: "Alex", role: "admin" });
    });
});

// ── hasStore / listStores ─────────────────────
describe("hasStore and listStores", () => {
    test("hasStore returns true for existing store", () => {
        createStore("user", {});
        expect(hasStore("user")).toBe(true);
    });

    test("hasStore returns false for missing store", () => {
        expect(hasStore("ghost")).toBe(false);
    });

    test("listStores returns all store names", () => {
        createStore("user", {});
        createStore("cart", {});
        expect(listStores()).toContain("user");
        expect(listStores()).toContain("cart");
    });
});

// ── deleteStore ───────────────────────────────
describe("deleteStore", () => {
    test("removes store", () => {
        createStore("user", { name: "Alex" });
        deleteStore("user");
        expect(hasStore("user")).toBe(false);
    });
});