import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import { pathToFileURL } from "node:url";

const distImport = async <T>(relativePath: string): Promise<T> =>
  import(pathToFileURL(path.resolve(process.cwd(), "dist", relativePath)).href) as Promise<T>;

const loadBuiltPackage = async () => {
  const [main, psr, runtimeAdmin] = await Promise.all([
    distImport<any>("index.js"),
    distImport<any>("psr.js"),
    distImport<any>("runtime-admin.js"),
  ]);
  return { main, psr, runtimeAdmin };
};

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const flushBuiltRuntime = async (ticks = 4): Promise<void> => {
  for (let index = 0; index < ticks; index += 1) {
    await wait();
  }
};

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

test("built package runtime graph and descriptors expose deterministic computed stores", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  try {
    main.createStore("letterProbeBase", { value: 2 });
    main.createComputed("letterProbeSummary", ["letterProbeBase"], (base: any) => (
      (base?.value ?? 0) * 2
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
    assert.ok(graph.nodes.some((node: any) =>
      node.id === descriptor.id
      && node.storeId === "letterProbeSummary"
      && node.type === "computed"
    ));
    assert.ok(graph.nodes.some((node: any) =>
      node.storeId === "letterProbeBase"
      && node.type === "leaf"
    ));
    assert.ok(graph.edges.some((edge: any) =>
      edge.from === descriptor.dependencies[0]
      && edge.to === descriptor.id
      && edge.type === "leaf-input"
    ));
  } finally {
    main.deleteComputed("letterProbeSummary");
  }
});

test("built package PSR subscriptions observe committed main-entry batched writes", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  main.createStore("letterBatch", { value: 0 });

  const seen: number[] = [];
  const off = psr.subscribeStore("letterBatch", (snapshot: any) => {
    seen.push(snapshot?.value ?? -1);
  });

  try {
    main.setStoreBatch(() => {
      main.setStore("letterBatch", "value", 1);
      main.setStore("letterBatch", "value", 2);
    });

    await flushBuiltRuntime();
    assert.deepStrictEqual(seen, [2]);
  } finally {
    off();
  }
});

test("built package PSR atomic patch failures roll back without leaking partial state", async () => {
  const { main, psr, runtimeAdmin } = await loadBuiltPackage();
  runtimeAdmin.clearAllStores();

  main.createStore("letterAtomicA", { value: 0 });
  main.createStore("letterAtomicB", { value: 0 });

  const seenA: number[] = [];
  const seenB: number[] = [];
  const offA = psr.subscribeStore("letterAtomicA", (snapshot: any) => {
    seenA.push(snapshot?.value ?? -1);
  });
  const offB = psr.subscribeStore("letterAtomicB", (snapshot: any) => {
    seenB.push(snapshot?.value ?? -1);
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
    ]), { ok: false, reason: "path" });

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
