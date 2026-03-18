/**
 * @module tests/types/public-api.types
 *
 * LAYER: Tests
 * OWNS:  Test coverage for tests/types/public-api.types.
 *
 * Consumers: Test runner.
 */
import "../../src/persist.js";
import "../../src/sync.js";
import "../../src/devtools/index.js";
import type { Expect, Equal } from "./assert.js";
import {
  createStore,
  createStoreStrict,
  setStore,
  getStore,
  hydrateStores,
  type StoreDefinition,
  type HydrateSnapshotFor,
  type HydrationResult,
  type StoreStateMap,
  store,
} from "../../src/store.js";
import { createCounterStore, createListStore, createEntityStore } from "../../src/helpers/index.js";
import { createSelector } from "../../src/selectors/index.js";
import { createStoreForRequest } from "../../src/server/index.js";
import type { StoreRegistry } from "../../src/server/index.js";
import { useAsyncStore, useFormStore, useSelector, useStore, useStoreField, useStoreStatic } from "../../src/react/index.js";
import type { AsyncStoreState } from "../../src/react/hooks-async.js";
import { fetchStore, getAsyncMetrics } from "../../src/async.js";
import { createMockStore, benchmarkStoreSet, withMockedTime } from "../../src/helpers/testing.js";

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;
type IsAssignable<From, To> = From extends To ? true : false;

const userStore = createStore("typedUser", {
  profile: {
    name: "Alex",
    age: 30,
  },
  active: true,
  tags: ["admin"] as string[],
}, {
  scope: "global",
  validate: (next: UserState) => typeof next.profile.name === "string" && typeof next.active === "boolean",
  persist: {
    version: 2,
    migrations: {
      2: (state) => ({
        ...state,
        active: Boolean(state.active),
      }),
    },
  },
  devtools: {
    historyLimit: 25,
    redactor: (state) => ({
      ...state,
      profile: { ...state.profile, name: "redacted" },
    }),
  },
  lifecycle: {
    middleware: [
      ({ next }) => next,
    ],
    onSet: (prev, next) => {
      void prev.profile.name;
      void next.profile.name;
    },
  },
  sync: {
    channel: "typed-user",
    maxPayloadBytes: 1024,
    conflictResolver: ({ incoming }) => incoming,
  },
});

type UserState = {
  profile: {
    name: string;
    age: number;
  };
  active: boolean;
  tags: string[];
};

type CreateStoreReturn = Expect<Equal<typeof userStore, StoreDefinition<"typedUser", UserState> | undefined>>;

const strictUserStore = createStoreStrict("typedStrictUser", { value: 1 });
type StrictCreateStoreReturn = Expect<Equal<typeof strictUserStore, StoreDefinition<"typedStrictUser", { value: number }>>>;

const lazyOkStore = createStore("typedLazy", () => ({ count: 0 }), { lazy: true });
type LazyCreateStoreReturn = Expect<Equal<typeof lazyOkStore, StoreDefinition<"typedLazy", { count: number }> | undefined>>;
// @ts-expect-error lazy stores require lazy: true when initialData is a function
createStore("typedLazyBad", () => ({ count: 1 }));
// @ts-expect-error lazy stores require function initialData
createStore("typedLazyBad2", { count: 1 }, { lazy: true });

if (userStore) {
  const wholeUser = getStore(userStore);
  const userName = getStore(userStore, "profile.name");
  const userAge = getStore(userStore, "profile.age");

  type WholeUserType = Expect<Equal<typeof wholeUser, Readonly<UserState> | null>>;
  type UserNameType = Expect<Equal<typeof userName, string | null>>;
  type UserAgeType = Expect<Equal<typeof userAge, number | null>>;

  setStore(userStore, "profile.name", "Jordan");
  setStore(userStore, "profile.age", 31);
  setStore(userStore, { active: false });
  setStore(userStore, (draft) => {
    draft.tags.push("editor");
  });

  // @ts-expect-error invalid path should be rejected
  setStore(userStore, "profile.email", "nope");
  // @ts-expect-error wrong value type should be rejected
  setStore(userStore, "profile.age", "31");
  // @ts-expect-error wrong partial type should be rejected
  setStore(userStore, { active: "no" });
}

const typedUserHandle = store<"typedUser", UserState>("typedUser");
const typedCounterHandle = store<"typedCounter", { value: number }>("typedCounter");
const typedFormHandle = store<"typedForm", { profile: { name: string } }>("typedForm");
const typedAsyncHandle = store<"typedAsync", AsyncStoreState<{ ok: boolean }>>("typedAsync");
const looseProfileHandle = store<"looseProfile", { profile: { name: string } }>("looseProfile");

const selectName = createSelector<UserState, string>("typedUser", (state) => state.profile.name);
type CreateSelectorReturn = Expect<Equal<typeof selectName, () => string | null>>;

type UserSelector = (state: StoreSnapshot<UserState>) => string;
type UseStoreSig = (name: typeof typedUserHandle, selector: UserSelector) => string | null;
type UseStoreFieldSig = (name: typeof typedCounterHandle, field: "value") => number | null;
type UseStoreStaticSig = (name: typeof typedUserHandle) => Readonly<UserState> | null;
type UseSelectorSig = (name: typeof typedUserHandle, selector: UserSelector) => string | null;
type UseFormStoreSig = (name: typeof typedFormHandle, field: "profile.name") => {
  value: string | null;
  onChange: (eOrValue: any) => void;
};
type UseAsyncStoreSig = (name: typeof typedAsyncHandle) => {
  status: "idle" | "loading" | "success" | "error" | "aborted";
  loading: boolean;
};

type UseStoreReturn = Expect<Equal<IsAssignable<typeof useStore, UseStoreSig>, true>>;
type UseStoreFieldReturn = Expect<Equal<IsAssignable<typeof useStoreField, UseStoreFieldSig>, true>>;
type UseStoreStaticReturn = Expect<Equal<IsAssignable<typeof useStoreStatic, UseStoreStaticSig>, true>>;
type UseSelectorReturn = Expect<Equal<IsAssignable<typeof useSelector, UseSelectorSig>, true>>;
type UseFormStoreValue = Expect<Equal<IsAssignable<typeof useFormStore, UseFormStoreSig>, true>>;
type UseAsyncStoreReturn = Expect<Equal<IsAssignable<typeof useAsyncStore, UseAsyncStoreSig>, true>>;

setStore(looseProfileHandle, "profile.name", "Tess");
// @ts-expect-error wrong value type should be rejected
setStore(looseProfileHandle, "profile.name", 123);

const looseTypedHandle = store<"looseTyped", { value: number }>("looseTyped");
setStore(looseTypedHandle, "value", 1);
// @ts-expect-error wrong value type should be rejected
setStore(looseTypedHandle, "value", "bad");

type RequestMap = StoreStateMap & {
  requestUser: { id: string; name: string };
  flags: { beta: boolean };
};

const requestStores = createStoreForRequest<RequestMap>((api) => {
  const created = api.create("requestUser", { id: "1", name: "Ava" });
  const updated = api.set("requestUser", (draft) => {
    draft.name = "Kai";
  });
  const flags = api.create("flags", { beta: false });
  const currentFlags = api.get("flags");

  type CreatedType = Expect<Equal<typeof created, { id: string; name: string }>>;
  type UpdatedType = Expect<Equal<typeof updated, { id: string; name: string }>>;
  type FlagsType = Expect<Equal<typeof flags, { beta: boolean }>>;
  type CurrentFlagsType = Expect<Equal<typeof currentFlags, { beta: boolean } | undefined>>;

  // @ts-expect-error unknown store name should be rejected
  api.create("unknown", { value: 1 });
  // @ts-expect-error wrong data shape should be rejected
  api.create("requestUser", { id: 1 });
  // @ts-expect-error wrong payload type should be rejected
  api.set("flags", { beta: "nope" });
});

const requestSnapshot = requestStores.snapshot();
type RequestSnapshotReturn = Expect<Equal<typeof requestSnapshot, Partial<RequestMap>>>;
type RequestRegistryReturn = Expect<Equal<typeof requestStores.registry, StoreRegistry>>;

type RequestHydrateSnapshot = HydrateSnapshotFor<RequestMap>;
const requestHydrateInput: RequestHydrateSnapshot = {
  requestUser: { id: "1", name: "Ava" },
  flags: { beta: false },
};
// @ts-expect-error hydrateStores requires explicit trust
hydrateStores<RequestHydrateSnapshot>(requestHydrateInput);
hydrateStores<RequestHydrateSnapshot>(requestHydrateInput, {}, { allowTrusted: true });

const counter = createCounterStore("typedCounter", 1);
counter.inc();
counter.dec(2);
counter.set(4);
const counterValue = counter.get();
type CounterGetReturn = Expect<Equal<typeof counterValue, number | null>>;
// @ts-expect-error counter only accepts numbers
counter.set("bad");

const list = createListStore<string>("typedList", ["a"]);
list.push("b");
list.replace(["c"]);
const listValues = list.all();
type ListAllReturn = Expect<Equal<typeof listValues, string[]>>;
// @ts-expect-error list item type must remain string
list.push(123);

const entities = createEntityStore<{ id: string; name: string }>("typedEntities");
entities.upsert({ id: "1", name: "Alex" });
const entity = entities.get("1");
type EntityGetReturn = Expect<Equal<typeof entity, { id: string; name: string } | null>>;
// @ts-expect-error entity payload is missing required fields
entities.upsert({ id: "2" });

const fetchPromise = fetchStore(typedAsyncHandle, Promise.resolve({ ok: true }), {
  retry: 1,
  cacheKey: "typed",
  onSuccess: (data) => {
    void data;
  },
});
type FetchStoreReturn = Expect<Equal<typeof fetchPromise, Promise<unknown>>>;

const asyncMetrics = getAsyncMetrics();
type AsyncMetricsReturn = Expect<Equal<typeof asyncMetrics, {
  cacheHits: number;
  cacheMisses: number;
  dedupes: number;
  requests: number;
  failures: number;
  avgMs: number;
  lastMs: number;
}>>;

const mock = createMockStore("typedMock", { value: 1 });
mock.set({ value: 2 });
mock.set((draft) => {
  draft.value = 3;
});
const mockHook = mock.use();
type MockUseReturn = Expect<Equal<typeof mockHook, StoreDefinition<"typedMock", { value: number }>>>;

const benchmark = benchmarkStoreSet(store<"typedBench", { value: number }>("typedBench"), 10, (i) => ({ value: i }));
type BenchmarkReturn = Expect<Equal<typeof benchmark, {
  iterations: number;
  totalMs: number;
  avgMs: number;
}>>;

const frozenNow = withMockedTime(123, () => Date.now());
type WithMockedTimeReturn = Expect<Equal<typeof frozenNow, number>>;

const hydratedLoose = hydrateStores(
  { hydrateLoose: { value: 1 } },
  { hydrateLoose: { persist: true }, default: { devtools: false } },
  { allowTrusted: true }
);
type HydratedLooseReturn = Expect<Equal<typeof hydratedLoose, HydrationResult>>;
// @ts-expect-error options should only accept keys from the snapshot
hydrateStores({ hydrateLoose: { value: 1 } }, { missing: { persist: true } }, { allowTrusted: true });

createStore("legacyTyped", { count: 1 }, {
  historyLimit: 10,
  middleware: [({ next }) => next],
  onSet: (prev, next) => {
    void prev.count;
    void next.count;
  },
  version: 2,
  migrations: {
    2: (state) => ({ ...state, count: state.count + 1 }),
  },
});

// @ts-expect-error invalid scope should be rejected
createStore("badScope", { value: 1 }, { scope: "scoped" });
// @ts-expect-error invalid sync maxPayloadBytes type should be rejected
createStore("badSync", { value: 1 }, { sync: { maxPayloadBytes: "big" } });


