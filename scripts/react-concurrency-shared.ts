import React from "react";
import { act, render } from "@testing-library/react";
import { resetAllStoresForTest } from "../src/helpers/testing.js";
import { useStore } from "../src/react/index.js";
import { createStore, getStore, replaceStore, store } from "../src/store.js";

export type ConcurrentStoreState = {
  value: number;
  parity: "even" | "odd";
  label: string;
};

export type ReactConcurrencyScenarioResult = {
  updates: number;
  renders: number;
  invariantViolations: string[];
  finalState: ConcurrentStoreState | null;
};

export const createConcurrentState = (value: number): ConcurrentStoreState => ({
  value,
  parity: value % 2 === 0 ? "even" : "odd",
  label: `count:${value}`,
});

const selectWholeState = (state: ConcurrentStoreState): ConcurrentStoreState => state;
const selectValueParity = (state: ConcurrentStoreState): { value: number; parity: "even" | "odd" } => ({
  value: state.value,
  parity: state.parity,
});
const equalValueParity = (
  left: { value: number; parity: "even" | "odd" } | null,
  right: { value: number; parity: "even" | "odd" } | null,
): boolean => left?.value === right?.value && left?.parity === right?.parity;

const assertStoreInvariants = (
  tag: string,
  snapshot: ConcurrentStoreState | null | undefined,
  violations: string[],
): void => {
  if (!snapshot) return;
  const expectedParity = snapshot.value % 2 === 0 ? "even" : "odd";
  if (snapshot.parity !== expectedParity) {
    violations.push(`${tag}: parity mismatch for value=${snapshot.value}`);
  }
  if (snapshot.label !== `count:${snapshot.value}`) {
    violations.push(`${tag}: label mismatch for value=${snapshot.value}`);
  }
};

const assertCoherentReads = (args: {
  tag: string;
  whole: ConcurrentStoreState | null;
  value: number | null;
  parity: "even" | "odd" | null;
  label: string | null;
  selected: { value: number; parity: "even" | "odd" } | null;
  violations: string[];
}): void => {
  assertStoreInvariants(args.tag, args.whole, args.violations);
  if (!args.whole) return;

  if (args.value !== args.whole.value) {
    args.violations.push(`${args.tag}: whole/value mismatch`);
  }
  if (args.parity !== args.whole.parity) {
    args.violations.push(`${args.tag}: whole/parity mismatch`);
  }
  if (args.label !== args.whole.label) {
    args.violations.push(`${args.tag}: whole/label mismatch`);
  }
  if (args.selected && (
    args.selected.value !== args.whole.value
    || args.selected.parity !== args.whole.parity
  )) {
    args.violations.push(`${args.tag}: whole/selector mismatch`);
  }
};

export const runTransitionScenario = async (
  options: { updates?: number } = {},
): Promise<ReactConcurrencyScenarioResult> => {
  const updates = options.updates ?? 24;
  resetAllStoresForTest();
  createStore("reactTransitionStore", createConcurrentState(0));
  const transitionStore = store<"reactTransitionStore", ConcurrentStoreState>("reactTransitionStore");

  let renders = 0;
  let pushUpdate: ((next: number) => void) | null = null;
  const invariantViolations: string[] = [];

  const App = () => {
    const whole = useStore(transitionStore, selectWholeState);
    const value = useStore(transitionStore, "value");
    const parity = useStore(transitionStore, "parity");
    const label = useStore(transitionStore, "label");
    const selected = useStore(transitionStore, selectValueParity, equalValueParity);
    const [, setLocalTick] = React.useState(0);
    const [isPending, startTransition] = React.useTransition();

    renders += 1;
    pushUpdate = (next) => {
      startTransition(() => {
        setLocalTick(next);
        replaceStore("reactTransitionStore", createConcurrentState(next));
      });
    };

    assertCoherentReads({
      tag: isPending ? "transition-pending" : "transition-live",
      whole,
      value,
      parity,
      label,
      selected,
      violations: invariantViolations,
    });

    return React.createElement("span", null, label ?? "");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  for (let index = 1; index <= updates; index += 1) {
    await act(async () => {
      pushUpdate?.(index);
      await Promise.resolve();
    });
  }

  const finalState = getStore("reactTransitionStore") as ConcurrentStoreState | null;

  await act(async () => {
    unmount();
  });

  return {
    updates,
    renders,
    invariantViolations,
    finalState,
  };
};

export const runDeferredScenario = async (
  options: { updates?: number } = {},
): Promise<ReactConcurrencyScenarioResult> => {
  const updates = options.updates ?? 24;
  resetAllStoresForTest();
  createStore("reactDeferredStore", createConcurrentState(0));
  const deferredStore = store<"reactDeferredStore", ConcurrentStoreState>("reactDeferredStore");

  let renders = 0;
  let pushUpdate: ((next: number) => void) | null = null;
  const invariantViolations: string[] = [];

  const App = () => {
    const whole = useStore(deferredStore, selectWholeState);
    const value = useStore(deferredStore, "value");
    const parity = useStore(deferredStore, "parity");
    const label = useStore(deferredStore, "label");
    const selected = useStore(deferredStore, selectValueParity, equalValueParity);
    const [localTick, setLocalTick] = React.useState(0);
    const deferredWhole = React.useDeferredValue(whole);
    const deferredTick = React.useDeferredValue(localTick);

    renders += 1;
    pushUpdate = (next) => {
      setLocalTick(next);
      replaceStore("reactDeferredStore", createConcurrentState(next));
    };

    assertCoherentReads({
      tag: `deferred-live:${deferredTick}`,
      whole,
      value,
      parity,
      label,
      selected,
      violations: invariantViolations,
    });
    assertStoreInvariants(`deferred-snapshot:${deferredTick}`, deferredWhole, invariantViolations);

    return React.createElement("span", null, label ?? "");
  };

  let unmount!: () => void;
  await act(async () => {
    ({ unmount } = render(React.createElement(App)));
  });

  for (let index = 1; index <= updates; index += 1) {
    await act(async () => {
      pushUpdate?.(index);
      await Promise.resolve();
    });
  }

  const finalState = getStore("reactDeferredStore") as ConcurrentStoreState | null;

  await act(async () => {
    unmount();
  });

  return {
    updates,
    renders,
    invariantViolations,
    finalState,
  };
};
