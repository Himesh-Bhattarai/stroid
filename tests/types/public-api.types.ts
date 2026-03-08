import type { Expect, Equal } from "./assert.js";
import {
  createStore,
  setStore,
  getStore,
  createSelector,
  createCounterStore,
  createListStore,
  createEntityStore,
  createZustandCompatStore,
  type StoreDefinition,
} from "../../src/store.js";
import { useAsyncStore, useFormStore, useSelector, useStore, useStoreField, useStoreStatic } from "../../src/hooks.js";
import { fetchStore, getAsyncMetrics } from "../../src/async.js";
import { createMockStore, benchmarkStoreSet, withMockedTime } from "../../src/testing.js";

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

if (userStore) {
  const wholeUser = getStore(userStore);
  const userName = getStore(userStore, "profile.name");
  const userAge = getStore(userStore, "profile.age");

  type WholeUserType = Expect<Equal<typeof wholeUser, UserState | null>>;
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

const selectName = createSelector<UserState, string>("typedUser", (state) => state.profile.name);
type CreateSelectorReturn = Expect<Equal<typeof selectName, () => string | null>>;

const selectedName = useStore<UserState, string>("typedUser", (state) => state.profile.name);
const selectedField = useStoreField<number>("typedCounter", "value");
const selectedStatic = useStoreStatic<UserState>("typedUser");
const selectedViaSelector = useSelector<UserState, string>("typedUser", (state) => state.profile.name);
const formStore = useFormStore<string>("typedForm", "profile.name");
const asyncHook = useAsyncStore("typedAsync");

type UseStoreReturn = Expect<Equal<typeof selectedName, string | null>>;
type UseStoreFieldReturn = Expect<Equal<typeof selectedField, number | null>>;
type UseStoreStaticReturn = Expect<Equal<typeof selectedStatic, UserState | null>>;
type UseSelectorReturn = Expect<Equal<typeof selectedViaSelector, string | null>>;
type UseFormStoreValue = Expect<Equal<typeof formStore.value, string | null>>;
type UseFormStoreOnChange = Expect<Equal<typeof formStore.onChange, (eOrValue: any) => void>>;
type UseAsyncStoreStatus = Expect<Equal<typeof asyncHook.status, "idle" | "loading" | "success" | "error" | "aborted">>;
type UseAsyncStoreLoading = Expect<Equal<typeof asyncHook.loading, boolean>>;

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

const zustandCompat = createZustandCompatStore<{ count: number; label: string }>((set, get, api) => {
  api.subscribe(() => undefined);
  return {
    count: 1,
    label: "ready",
  };
}, { name: "typedZustand" });

zustandCompat.setState({ count: 2 });
zustandCompat.subscribeWithSelector((state) => state.count, Object.is, (next, prev) => {
  const diff = next - prev;
  void diff;
});
const zustandState = zustandCompat.getState();
type ZustandGetState = Expect<Equal<typeof zustandState, { count: number; label: string }>>;
// @ts-expect-error count must remain numeric
zustandCompat.setState({ count: "bad" });

const fetchPromise = fetchStore("typedAsync", Promise.resolve({ ok: true }), {
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
type MockUseReturn = Expect<Equal<typeof mockHook, { name: string }>>;

const benchmark = benchmarkStoreSet("typedBench", 10, (i) => ({ value: i }));
type BenchmarkReturn = Expect<Equal<typeof benchmark, {
  iterations: number;
  totalMs: number;
  avgMs: number;
}>>;

const frozenNow = withMockedTime(123, () => Date.now());
type WithMockedTimeReturn = Expect<Equal<typeof frozenNow, number>>;

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
