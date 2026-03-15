/**
 * @module tests/types/ambient-store-map.types
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/types/ambient-store-map.types.
 *
 * Consumers: Test runner.
 */
import type { Expect, Equal } from "./assert.js";
import { createStore, getStore, setStore } from "../../src/store.js";

declare module "../../src/store-lifecycle/types.js" {
  interface StoreStateMap {
    ambientUser: {
      name: string;
      age: number;
    };
  }
}

const whole = getStore("ambientUser");
const name = getStore("ambientUser", "name");

type WholeReturn = Expect<Equal<typeof whole, Readonly<{ name: string; age: number }> | null>>;
type NameReturn = Expect<Equal<typeof name, string | null>>;

setStore("ambientUser", "age", 42);
setStore("ambientUser", { name: "Ada" });

// @ts-expect-error wrong value type should be rejected
setStore("ambientUser", "age", "nope");

createStore("validateContext", { count: 0 }, {
  validate: (next) => {
    const c: number = next.count;
    void c;
    return true;
  },
});



