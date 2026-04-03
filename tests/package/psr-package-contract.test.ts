import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";

type MainEntry = typeof import("../../src/index.js");
type PsrEntry = typeof import("../../src/psr/index.js");
type QueryEntry = typeof import("../../src/query.js");
type RuntimeAdminEntry = typeof import("../../src/runtime-admin/index.js");
type InstallEntry = typeof import("../../src/install.js");

const distImport = async <T>(relativePath: string): Promise<T> =>
  import(pathToFileURL(path.resolve(process.cwd(), "dist", relativePath)).href) as Promise<T>;

const loadBuiltPackage = async () => {
  const [main, psr, query, runtimeAdmin, install] = await Promise.all([
    distImport<MainEntry>("index.js"),
    distImport<PsrEntry>("psr.js"),
    distImport<QueryEntry>("query.js"),
    distImport<RuntimeAdminEntry>("runtime-admin.js"),
    distImport<InstallEntry>("install.js"),
  ]);
  return { main, psr, query, runtimeAdmin, install };
};

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const flushBuiltRuntime = async (ticks = 4): Promise<void> => {
  for (let index = 0; index < ticks; index += 1) {
    await wait();
  }
};

const isValueBox = (snapshot: unknown): snapshot is { value: number } =>
  typeof snapshot === "object"
  && snapshot !== null
  && "value" in snapshot
  && typeof (snapshot as Record<string, unknown>).value === "number";

test("built package PSR APIs resolve string, definition, and key targets for main-entry stores", () => {
  return loadBuiltPackage().then(({ main, psr, runtimeAdmin }) => {
    runtimeAdmin.clearAllStores();

    const definition = main.createStore("letterProbeCart", {
      items: [{ sku: "starter", qty: 1 }],
      total: 1,
    });
    assert.ok(definition);

    const key = main.store("letterProbeCart");
    assert.strictEqual(psr.hasStore("letterProbeCart"), true);
    assert.strictEqual(psr.hasStore(definition), true);
    assert.strictEqual(psr.hasStore(key), true);

    assert.deepStrictEqual(psr.getStoreSnapshot("letterProbeCart"), {
      items: [{ sku: "starter", qty: 1 }],
      total: 1,
    });
    assert.deepStrictEqual(psr.getStoreSnapshot(definition), {
      items: [{ sku: "starter", qty: 1 }],
      total: 1,
    });
    assert.deepStrictEqual(psr.getStoreSnapshot(key), {
      items: [{ sku: "starter", qty: 1 }],
      total: 1,
    });

    assert.deepStrictEqual(psr.applyStorePatch({
      id: "letter-set-total",
      store: "letterProbeCart",
      path: ["total"],
      op: "set",
      value: 2,
      meta: {
        timestamp: 1,
        source: "setStore",
      },
    }), { ok: true });

    assert.deepStrictEqual(main.getStore(key), {
      items: [{ sku: "starter", qty: 1 }],
      total: 2,
    });
  });
});

test("built package PSR patch parity supports nested merge, delete, insert, and failedPatchId reporting", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  main.createStore("letterPatchParity", {
    profile: {
      name: "Ava",
      stats: {
        visits: 1,
        likes: 0,
      },
    },
    items: [
      { id: 1, label: "one" },
      { id: 3, label: "three" },
    ],
  });

  assert.deepStrictEqual(psr.applyStorePatch({
    id: "letter-nested-merge",
    store: "letterPatchParity",
    path: ["profile", "stats"],
    op: "merge",
    value: { likes: 2 },
    meta: {
      timestamp: 1.1,
      source: "setStore",
    },
  }), { ok: true });

  assert.deepStrictEqual(psr.applyStorePatch({
    id: "letter-array-insert",
    store: "letterPatchParity",
    path: ["items", 1],
    op: "insert",
    value: { id: 2, label: "two" },
    meta: {
      timestamp: 1.2,
      source: "setStore",
    },
  }), { ok: true });

  assert.deepStrictEqual(psr.applyStorePatch({
    id: "letter-object-delete",
    store: "letterPatchParity",
    path: ["profile", "name"],
    op: "delete",
    meta: {
      timestamp: 1.3,
      source: "setStore",
    },
  }), { ok: true });

  assert.deepStrictEqual(main.getStore("letterPatchParity"), {
    profile: {
      stats: {
        visits: 1,
        likes: 2,
      },
    },
    items: [
      { id: 1, label: "one" },
      { id: 2, label: "two" },
      { id: 3, label: "three" },
    ],
  });

  assert.deepStrictEqual(psr.applyStorePatchesAtomic([
    {
      id: "letter-batch-good",
      store: "letterPatchParity",
      path: ["items", 0],
      op: "delete",
      meta: {
        timestamp: 1.4,
        source: "setStore",
      },
    },
    {
      id: "letter-batch-bad",
      store: "letterPatchParity",
      path: ["profile", "stats", "likes"],
      op: "insert",
      value: 9,
      meta: {
        timestamp: 1.5,
        source: "setStore",
      },
    },
  ]), {
    ok: false,
    reason: "unsupported-path-shape",
    failedPatchId: "letter-batch-bad",
  });

  assert.deepStrictEqual(main.getStore("letterPatchParity"), {
    profile: {
      stats: {
        visits: 1,
        likes: 2,
      },
    },
    items: [
      { id: 1, label: "one" },
      { id: 2, label: "two" },
      { id: 3, label: "three" },
    ],
  });
});

test("built package query entry exposes standalone cache-key helpers", async () => {
  const { main, query, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  const definition = main.createStore("letterQueryCart", {
    items: [{ sku: "starter", qty: 1 }],
    total: 1,
  });
  assert.ok(definition);

  const key = main.store("letterQueryCart");

  assert.deepStrictEqual(query.reactQueryKey("letterQueryCart"), ["stroid", "letterQueryCart"]);
  assert.deepStrictEqual(query.reactQueryKey(definition, "v1"), ["stroid", "letterQueryCart", "v1"]);
  assert.deepStrictEqual(query.swrKey(key, 7), ["stroid", "letterQueryCart", 7]);
});

test("built package runtime graph and descriptors expose deterministic computed stores", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  try {
    const base = main.createStore("letterProbeBase", { value: 2 });
    assert.ok(base);
    main.createComputed("letterProbeSummary", [base], (baseValue) => (
      (baseValue?.value ?? 0) * 2
    ), {
      classification: "deterministic",
    });

    assert.strictEqual(main.getStore("letterProbeSummary"), 4);

    const descriptor = psr.getComputedDescriptor("letterProbeSummary");
    assert.ok(descriptor);
    assert.strictEqual(descriptor.classification, "deterministic");
    assert.deepStrictEqual(psr.getComputedDescriptor(descriptor.id), descriptor);

    const graph = psr.getRuntimeGraph();
    assert.strictEqual(graph.granularity, "store");
    assert.ok(graph.nodes.some((node) =>
      node.id === descriptor.id
      && node.storeId === "letterProbeSummary"
      && node.type === "computed"
    ));
    assert.ok(graph.nodes.some((node) =>
      node.storeId === "letterProbeBase"
      && node.type === "leaf"
    ));
    assert.ok(graph.edges.some((edge) =>
      edge.from === descriptor.dependencies[0]
      && edge.to === descriptor.id
      && edge.type === "leaf-input"
    ));
  } finally {
    main.deleteComputed("letterProbeSummary");
  }
});

test("built package deterministic PSR evaluation matches the committed computed value for the same snapshot", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  try {
    const base = main.createStore("letterPreviewBase", { value: 2 });
    assert.ok(base);
    main.createComputed("letterPreviewDouble", [base], (baseValue) => (
      (baseValue?.value ?? 0) * 2
    ), {
      classification: "deterministic",
    });

    const descriptor = psr.getComputedDescriptor("letterPreviewDouble");
    assert.ok(descriptor);
    assert.strictEqual(psr.evaluateComputed(descriptor.id, {
      letterPreviewBase: { value: 5 },
      letterPreviewDouble: 4,
    }), 10);

    assert.deepStrictEqual(psr.applyStorePatch({
      id: "letter-preview-commit",
      store: "letterPreviewBase",
      path: ["value"],
      op: "set",
      value: 5,
      meta: {
        timestamp: 1.6,
        source: "setStore",
      },
    }), { ok: true });

    await flushBuiltRuntime();
    assert.strictEqual(psr.getStoreSnapshot("letterPreviewDouble"), 10);
  } finally {
    main.deleteComputed("letterPreviewDouble");
  }
});

test("built package PSR evaluation rejects opaque and async-boundary computed nodes", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  try {
    const contractSource = main.createStore("letterPreviewContractSource", { value: 2 });
    assert.ok(contractSource);

    let externalOffset = 5;
    main.createComputed("letterPreviewOpaque", [contractSource], (baseValue) => (
      (baseValue?.value ?? 0) + externalOffset
    ));
    main.createComputed("letterPreviewBoundary", [contractSource], (baseValue) => ({
      value: baseValue?.value ?? 0,
    }), {
      classification: "asyncBoundary",
    });

    const opaqueDescriptor = psr.getComputedDescriptor("letterPreviewOpaque");
    const boundaryDescriptor = psr.getComputedDescriptor("letterPreviewBoundary");

    assert.ok(opaqueDescriptor);
    assert.ok(boundaryDescriptor);
    assert.strictEqual(opaqueDescriptor.classification, "opaque");
    assert.strictEqual(boundaryDescriptor.classification, "asyncBoundary");

    assert.throws(() => psr.evaluateComputed(opaqueDescriptor.id, {
      letterPreviewContractSource: { value: 7 },
      letterPreviewOpaque: 12,
    }), /deterministic/i);
    assert.throws(() => psr.evaluateComputed(boundaryDescriptor.id, {
      letterPreviewContractSource: { value: 7 },
      letterPreviewBoundary: { value: 7 },
    }), /deterministic/i);
  } finally {
    main.deleteComputed("letterPreviewOpaque");
    main.deleteComputed("letterPreviewBoundary");
  }
});

test("built package PSR subscriptions observe committed main-entry batched writes", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  main.createStore("letterBatch", { value: 0 });

  const seen: number[] = [];
  const off = psr.subscribeStore("letterBatch", (snapshot) => {
    seen.push(isValueBox(snapshot) ? snapshot.value : -1);
  });

  try {
    main.setStoreBatch(() => {
      main.setStore("letterBatch", "value", 1);
      main.setStore("letterBatch", "value", 2);
    });

    await flushBuiltRuntime();
    assert.deepStrictEqual(seen, [2]);

    off();
    off();

    main.setStore("letterBatch", "value", 3);
    await flushBuiltRuntime();
    assert.deepStrictEqual(seen, [2]);
  } finally {
    off();
  }
});

test("built package PSR computed subscriptions notify only after dependency writes settle", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  try {
    const source = main.createStore("letterComputedSource", { value: 1 });
    assert.ok(source);
    main.createComputed("letterComputedTotal", [source], (sourceValue) => (
      (sourceValue?.value ?? 0) * 2
    ), {
      classification: "deterministic",
    });

    const seen: number[] = [];
    const off = psr.subscribeStore("letterComputedTotal", (snapshot) => {
      seen.push(typeof snapshot === "number" ? snapshot : -1);
    });

    try {
      main.setStoreBatch(() => {
        main.setStore("letterComputedSource", "value", 2);
        main.setStore("letterComputedSource", "value", 3);
      });

      await flushBuiltRuntime();
      assert.ok(seen.length >= 1);
      assert.ok(seen.every((value) => value === 6));
    } finally {
      off();
    }
  } finally {
    main.deleteComputed("letterComputedTotal");
  }
});

test("built package PSR timing contracts expose downgrade reasons for async and shared authority", async () => {
  const { main, psr, runtimeAdmin, install } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();
  install.installPersist();
  install.installSync();

  try {
    main.createStore("letterTimingPlain", { value: 1 });
    main.createStore("letterTimingAsync", { value: 1 }, {
      persist: {
        encryptAsync: async (value: string) => value,
        decryptAsync: async (value: string) => value,
      },
    });
    main.createStore("letterTimingShared", { value: 1 }, {
      sync: {
        channel: "letter-timing",
        policy: "insecure",
      },
    });
    main.createStore("letterTimingSource", { value: 1 });
    main.createComputed("letterTimingBoundary", ["letterTimingSource"], (value) => value, {
      classification: "asyncBoundary",
    });

    assert.deepStrictEqual(psr.getTimingContract("letterTimingPlain"), {
      simulationWindow: "pre-commit",
      executionModel: "sync",
      effectScope: "out-of-pipeline",
      governanceMode: "full-governor",
      mutationAuthority: "exclusive",
      causalityBoundary: "none",
      reasons: [],
    });
    assert.deepStrictEqual(psr.getTimingContract("letterTimingAsync"), {
      simulationWindow: "pre-commit",
      executionModel: "async-boundary",
      effectScope: "in-pipeline",
      governanceMode: "bounded-governor",
      mutationAuthority: "exclusive",
      causalityBoundary: "async-boundary",
      reasons: [
        "persist for \"letterTimingAsync\" introduces async boundary work",
      ],
    });
    assert.deepStrictEqual(psr.getTimingContract("letterTimingShared"), {
      simulationWindow: "pre-commit",
      executionModel: "async-boundary",
      effectScope: "in-pipeline",
      governanceMode: "observer",
      mutationAuthority: "shared",
      causalityBoundary: "async-boundary",
      reasons: [
        "sync for \"letterTimingShared\" can apply remote writes outside the local commit path",
      ],
    });
    assert.deepStrictEqual(psr.getTimingContract("letterTimingSource"), {
      simulationWindow: "pre-commit",
      executionModel: "async-boundary",
      effectScope: "out-of-pipeline",
      governanceMode: "bounded-governor",
      mutationAuthority: "exclusive",
      causalityBoundary: "async-boundary",
      reasons: [
        "downstream computed node \"letterTimingBoundary\" is marked asyncBoundary",
      ],
    });
    assert.deepStrictEqual(psr.getTimingContract(), {
      simulationWindow: "pre-commit",
      executionModel: "async-boundary",
      effectScope: "in-pipeline",
      governanceMode: "observer",
      mutationAuthority: "shared",
      causalityBoundary: "async-boundary",
      reasons: [
        "computed node \"letterTimingBoundary\" is marked asyncBoundary",
        "persist for \"letterTimingAsync\" introduces async boundary work",
        "sync for \"letterTimingShared\" can apply remote writes outside the local commit path",
      ],
    });
  } finally {
    main.deleteComputed("letterTimingBoundary");
  }
});

test("built package PSR atomic patch failures roll back without leaking partial state", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  main.createStore("letterAtomicA", { value: 0 });
  main.createStore("letterAtomicB", { value: 0 });

  const seenA: number[] = [];
  const seenB: number[] = [];
  const offA = psr.subscribeStore("letterAtomicA", (snapshot) => {
    seenA.push(isValueBox(snapshot) ? snapshot.value : -1);
  });
  const offB = psr.subscribeStore("letterAtomicB", (snapshot) => {
    seenB.push(isValueBox(snapshot) ? snapshot.value : -1);
  });

  try {
    assert.deepStrictEqual(psr.applyStorePatchesAtomic([
      {
        id: "letter-atomic-good",
        store: "letterAtomicA",
        path: ["value"],
        op: "set",
        value: 1,
        meta: {
          timestamp: 2,
          source: "setStore",
        },
      },
      {
        id: "letter-atomic-bad",
        store: "letterAtomicB",
        path: ["missing"],
        op: "set",
        value: 2,
        meta: {
          timestamp: 3,
          source: "setStore",
        },
      },
    ]), {
      ok: false,
      reason: "path",
      failedPatchId: "letter-atomic-bad",
    });

    await flushBuiltRuntime();
    assert.deepStrictEqual(main.getStore("letterAtomicA"), { value: 0 });
    assert.deepStrictEqual(main.getStore("letterAtomicB"), { value: 0 });
    assert.deepStrictEqual(seenA, []);
    assert.deepStrictEqual(seenB, []);
  } finally {
    offA();
    offB();
  }
});
