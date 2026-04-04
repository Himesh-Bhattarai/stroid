import { setStoreWithContext } from "../../src/core/store-write.js";
import { resetAllStoresForTest } from "../../src/helpers/testing.js";
import {
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
} from "../../src/runtime-tools/index.js";
import {
  createStore,
  getStore,
  hydrateStores,
} from "../../src/store.js";

export type WebsocketStreamState = {
  messages: string[];
  lastSeq: number;
};

export type WebsocketHydrationScenarioResult = {
  beforeClose: number;
  afterClose: number;
  finalState: WebsocketStreamState | null;
  receivedOrder: string[];
  eventSources: string[];
  queuedWrites: number;
  replayedWrites: number;
};

const wait = async (ms = 0): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

export const runWebsocketHydrationStreamScenario = async (
  options: {
    beforeClose?: number;
    afterClose?: number;
  } = {},
): Promise<WebsocketHydrationScenarioResult> => {
  const beforeClose = options.beforeClose ?? 4;
  const afterClose = options.afterClose ?? 2;

  resetAllStoresForTest();
  createStore("chatStream", {
    messages: ["server"],
    lastSeq: 0,
  });

  const hydration = hydrateStores(
    {
      chatStream: {
        messages: ["server"],
        lastSeq: 0,
      },
    },
    {},
    { allowTrusted: true },
    {
      bootWindow: {
        mode: "manual",
      },
      policyMap: {
        chatStream: "client_wins",
      },
    },
  );

  const receivedOrder: string[] = [];
  const sendFrame = async (seq: number, label: string): Promise<void> => {
    if (seq % 2 === 0) {
      await wait(0);
    } else {
      await Promise.resolve();
    }
    receivedOrder.push(label);
    setStoreWithContext(
      "chatStream",
      (draft: WebsocketStreamState) => {
        draft.lastSeq = seq;
        draft.messages.push(label);
      },
      undefined,
      { sourceHint: "sync" },
    );
  };

  for (let seq = 1; seq <= beforeClose; seq += 1) {
    await sendFrame(seq, `ws:${seq}`);
    if (seq < beforeClose) {
      const current = getStore("chatStream") as WebsocketStreamState | null;
      if (current?.lastSeq !== 0 || current?.messages.join("|") !== "server") {
        throw new Error(`sync frame ${seq} leaked through the boot window`);
      }
    }
  }

  const queuedBeforeClose = getHydrationDriftMetrics().pendingWrites;
  if (queuedBeforeClose !== beforeClose) {
    throw new Error(`expected ${beforeClose} queued websocket writes, saw ${queuedBeforeClose}`);
  }

  hydration.bootWindow?.close();

  for (let seq = beforeClose + 1; seq <= beforeClose + afterClose; seq += 1) {
    await sendFrame(seq, `ws:${seq}`);
  }

  const finalState = getStore("chatStream") as WebsocketStreamState | null;
  const finalMessages = finalState?.messages.slice(1) ?? [];
  const expectedMessages = Array.from({ length: beforeClose + afterClose }, (_, index) => `ws:${index + 1}`);
  if (finalMessages.join("|") !== expectedMessages.join("|")) {
    throw new Error(`expected websocket replay order ${expectedMessages.join(",")} but saw ${finalMessages.join(",")}`);
  }

  const metrics = getHydrationDriftMetrics();
  return {
    beforeClose,
    afterClose,
    finalState,
    receivedOrder,
    eventSources: getHydrationDriftEvents(beforeClose + afterClose).map((event) => event.source),
    queuedWrites: metrics.queuedWrites,
    replayedWrites: metrics.replayedWrites,
  };
};
