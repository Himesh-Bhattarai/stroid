/**
 * @module tests/types/react-hooks-typed.types
 *
 * LAYER: Tests
 * OWNS:  Type coverage for React hook overloads against ambient StoreStateMap names.
 *
 * Consumers: Test runner.
 */
import type { Expect, Equal } from "./assert.js";
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
    typedHookUser: {
      name: string;
      age: number;
    };
    typedHookAsync: {
      data: { ok: boolean } | null;
      loading: boolean;
      revalidating?: boolean;
      error: string | null;
      status: "idle" | "loading" | "success" | "error" | "aborted";
    };
  }
}

const wholeHook = useStore("typedHookUser");
const fieldHook = useStoreField("typedHookUser", "age");
const staticHook = useStoreStatic("typedHookUser", "name");
const selectedAge = useSelector("typedHookUser", (state) => state.age);
const formHook = useFormStore("typedHookUser", "name");
const asyncHook = useAsyncStore("typedHookAsync");
const suspenseData = useAsyncStoreSuspense("typedHookAsync");

type WholeHookReturn = Expect<Equal<typeof wholeHook, Readonly<{ name: string; age: number }> | null>>;
type FieldHookReturn = Expect<Equal<typeof fieldHook, number | null>>;
type StaticHookReturn = Expect<Equal<typeof staticHook, string | null>>;
type SelectedAgeReturn = Expect<Equal<typeof selectedAge, number | null>>;
type FormHookValue = Expect<Equal<typeof formHook.value, string | null>>;
type FormHookOnChange = Expect<Equal<typeof formHook.onChange, (eOrValue: unknown) => void>>;
type AsyncHookReturn = Expect<Equal<typeof asyncHook, AsyncStoreSnapshot<{ ok: boolean } | null>>>;
type SuspenseHookReturn = Expect<Equal<typeof suspenseData, { ok: boolean } | null>>;

// @ts-expect-error wrong ambient hook path should be rejected
useStoreField("typedHookUser", "missing");
// @ts-expect-error wrong ambient form path should be rejected
useFormStore("typedHookUser", "missing");
