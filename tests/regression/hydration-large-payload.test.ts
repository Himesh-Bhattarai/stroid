/**
 * @module tests/regression/hydration-large-payload
 *
 * LAYER: Regression
 * OWNS:  Large-payload hydration parity coverage.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import { runLargePayloadScenario } from "../../scripts/hydration-large-payload-shared.js";

test("large-payload hydration replay matches immediate execution", async () => {
  const immediate = await runLargePayloadScenario({
    targetKb: 512,
    queued: false,
  });
  const queued = await runLargePayloadScenario({
    targetKb: 512,
    queued: true,
  });

  assert.deepStrictEqual(queued.finalState, immediate.finalState);
  assert.strictEqual(immediate.driftEvents, queued.driftEvents);
  assert.strictEqual(queued.queuedWrites, 3);
  assert.strictEqual(queued.replayedWrites, 3);
  assert.ok((queued.approximateBytes / 1024) >= 512);
});
