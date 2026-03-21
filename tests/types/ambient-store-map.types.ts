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
import {
  useAsyncStore,
  useAsyncStoreSuspense,
  useFormStore,
  useSelector,
  useStore,
  useStoreField,
  useStoreStatic,
} from "../../src/react/index.js";
import type { AsyncStoreSnapshot } from "../../src/react/hooks-async.js";

declare module "../../src/core/store-lifecycle/types.js" {
  interface StoreStateMap {
    ambientUser: {
      name: string;
      age: number;
    };
    ambientAsync: {
      data: { ok: boolean } | null;
      loading: boolean;
      revalidating?: boolean;
      error: string | null;
      status: "idle" | "loading" | "success" | "error" | "aborted";
    };
  }
}

const whole = getStore("ambientUser");
const name = getStore("ambientUser", "name");
const wholeHook = useStore("ambientUser");
const fieldHook = useStoreField("ambientUser", "age");
const staticHook = useStoreStatic("ambientUser", "name");
const selectedAge = useSelector("ambientUser", (state) => state.age);
const formHook = useFormStore("ambientUser", "name");
const asyncHook = useAsyncStore("ambientAsync");
const suspenseData = useAsyncStoreSuspense("ambientAsync");

type WholeReturn = Expect<Equal<typeof whole, Readonly<{ name: string; age: number }> | null>>;
type NameReturn = Expect<Equal<typeof name, string | null>>;
type WholeHookReturn = Expect<Equal<typeof wholeHook, Readonly<{ name: string; age: number }> | null>>;
type FieldHookReturn = Expect<Equal<typeof fieldHook, number | null>>;
type StaticHookReturn = Expect<Equal<typeof staticHook, string | null>>;
type SelectedAgeReturn = Expect<Equal<typeof selectedAge, number | null>>;
type FormHookValue = Expect<Equal<typeof formHook.value, string | null>>;
type FormHookOnChange = Expect<Equal<typeof formHook.onChange, (eOrValue: unknown) => void>>;
type AsyncHookReturn = Expect<Equal<typeof asyncHook, AsyncStoreSnapshot<{ ok: boolean } | null>>>;
type SuspenseHookReturn = Expect<Equal<typeof suspenseData, { ok: boolean } | null>>;

setStore("ambientUser", "age", 42);
setStore("ambientUser", { name: "Ada" });

// @ts-expect-error wrong value type should be rejected
setStore("ambientUser", "age", "nope");
// @ts-expect-error wrong ambient hook path should be rejected
useStoreField("ambientUser", "missing");
// @ts-expect-error wrong ambient form path should be rejected
useFormStore("ambientUser", "missing");

createStore("validateContext", { count: 0 }, {
  validate: (next) => {
    const c: number = next.count;
    void c;
    return true;
  },
});



