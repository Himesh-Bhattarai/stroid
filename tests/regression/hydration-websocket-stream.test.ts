/**
 * @module tests/regression/hydration-websocket-stream
 *
 * LAYER: Regression
 * OWNS:  Long-lived websocket-style sync stream ordering across the hydration boot window.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import {
  runWebsocketHydrationStreamScenario,
} from "../../scripts/hydration/websocket-hydration-stream-shared.js";

test("websocket-style sync frames queue before boot-window close and continue in order after replay", async () => {
  const result = await runWebsocketHydrationStreamScenario({
    beforeClose: 5,
    afterClose: 3,
  });

  assert.deepStrictEqual(result.receivedOrder, [
    "ws:1",
    "ws:2",
    "ws:3",
    "ws:4",
    "ws:5",
    "ws:6",
    "ws:7",
    "ws:8",
  ]);
  assert.deepStrictEqual(result.finalState, {
    messages: [
      "server",
      "ws:1",
      "ws:2",
      "ws:3",
      "ws:4",
      "ws:5",
      "ws:6",
      "ws:7",
      "ws:8",
    ],
    lastSeq: 8,
  });
  assert.deepStrictEqual(result.eventSources, [
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
    "sync",
  ]);
  assert.strictEqual(result.queuedWrites, 5);
  assert.strictEqual(result.replayedWrites, 5);
});
