/**
 * @module tests/integration/core/next-server-actions
 *
 * LAYER: Integration
 * OWNS:  Next.js App Router style render-to-action request-scope hand-off coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  renderDraftPage,
  saveDraftAction,
} from "../../../examples/next-app-router-server-actions.js";

test("Next-style server actions can resume request-scoped state from the render capture", async () => {
  const rendered = await renderDraftPage({
    userId: "ava",
    requestId: "req-1",
  });

  assert.match(rendered.html, /data-user="ava"/);
  assert.match(rendered.html, /data-request="req-1"/);

  const resumed = await saveDraftAction(rendered.requestState, "saved:ava");

  assert.deepStrictEqual(resumed.snapshot, {
    session: {
      userId: "ava",
      role: "editor",
      requestId: "req-1",
    },
    draft: {
      body: "saved:ava",
      revision: 2,
      lastSavedBy: "ava",
    },
  });

  assert.deepStrictEqual(rendered.requestState.snapshot, {
    session: {
      userId: "ava",
      role: "editor",
      requestId: "req-1",
    },
    draft: {
      body: "draft:ava",
      revision: 1,
      lastSavedBy: null,
    },
  });
});

test("Next-style server actions stay isolated across concurrent request captures", async () => {
  const [renderedA, renderedB] = await Promise.all([
    renderDraftPage({
      userId: "alice",
      requestId: "req-A",
    }),
    renderDraftPage({
      userId: "bob",
      requestId: "req-B",
    }),
  ]);

  const [resumedA, resumedB] = await Promise.all([
    saveDraftAction(renderedA.requestState, "saved:alice"),
    saveDraftAction(renderedB.requestState, "saved:bob"),
  ]);

  assert.deepStrictEqual(resumedA.snapshot, {
    session: {
      userId: "alice",
      role: "editor",
      requestId: "req-A",
    },
    draft: {
      body: "saved:alice",
      revision: 2,
      lastSavedBy: "alice",
    },
  });

  assert.deepStrictEqual(resumedB.snapshot, {
    session: {
      userId: "bob",
      role: "editor",
      requestId: "req-B",
    },
    draft: {
      body: "saved:bob",
      revision: 2,
      lastSavedBy: "bob",
    },
  });
});
