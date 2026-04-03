/**
 * BroadcastChannel sync stress tests.
 *
 * WHAT: Simulates tab peers, tie-breaking conflicts, skewed timestamps, mid-sync closure, and message storms.
 * WHY: Cross-tab state drift and conflict bugs are hard to detect and costly in production.
 */
import { describe, expect, it } from "vitest";
import { createStore, getStore, setStore } from "stroid";
import { flushMicrotasks, installMockBroadcastChannel, MockBroadcastChannel } from "../shared/mocks";

const channel = "stress.sync.channel";
const storeName = "stress.sync.store";

type SyncMessage = {
    v: number;
    protocol: number;
    type: "sync-state";
    name: string;
    clock: number;
    source: string;
    updatedAt: number;
    data: { value: string | number };
    checksum: null;
};

const createSyncedStore = (initial: { value: string | number }): void => {
    createStore(storeName, initial, {
        sync: {
            policy: "insecure",
            channel,
            checksum: "none",
        },
    });
};

describe("stress broadcast sync", () => {
    it("syncs write from tab A to tab B observer", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();
        createSyncedStore({ value: "A0" });

        let tabBSeen: string | number | null = null;
        const tabB = new MockBroadcastChannel(channel);
        tabB.onmessage = (event) => {
            const msg = event.data as Partial<SyncMessage>;
            if (msg.type !== "sync-state") return;
            tabBSeen = (msg.data as { value: string | number }).value;
        };

        setStore(storeName, { value: "from-A" });
        await flushMicrotasks(10);

        expect(tabBSeen).toBe("from-A");
    });

    it("applies deterministic LWW tie-break for same clock using lexical source order", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();
        createSyncedStore({ value: "local" });

        const tap = new MockBroadcastChannel(channel);
        let localSyncMessage: SyncMessage | null = null;
        tap.onmessage = (event) => {
            const msg = event.data as SyncMessage;
            if (msg.type !== "sync-state") return;
            if (msg.data?.value === "A") localSyncMessage = msg;
        };

        setStore(storeName, { value: "A" });
        await flushMicrotasks(8);
        expect(localSyncMessage).not.toBeNull();

        const incomingSource = `${String(localSyncMessage?.source)}~peer`;
        const peer = new MockBroadcastChannel(channel);
        peer.postMessage({
            v: 1,
            protocol: 1,
            type: "sync-state",
            name: storeName,
            clock: Number(localSyncMessage?.clock ?? 1),
            source: incomingSource,
            updatedAt: Number(localSyncMessage?.updatedAt ?? Date.now()),
            data: { value: "B" },
            checksum: null,
        } satisfies SyncMessage);
        await flushMicrotasks(10);

        expect(getStore(storeName)).toEqual({ value: "B" });
    });

    it("demonstrates clock-skew risk when newer timestamps are trusted by resolver", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();

        createStore(storeName, { value: "local" }, {
            sync: {
                policy: "insecure",
                channel,
                checksum: "none",
                conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }) =>
                    incomingUpdated > localUpdated ? incoming : local,
            },
        });

        const peer = new MockBroadcastChannel(channel);
        peer.postMessage({
            v: 1,
            protocol: 1,
            type: "sync-state",
            name: storeName,
            clock: 1,
            source: "peer-clock+5000",
            updatedAt: Date.now() + 5000,
            data: { value: "skewed" },
            checksum: null,
        } satisfies SyncMessage);
        await flushMicrotasks(8);

        expect(getStore(storeName)).toEqual({ value: "skewed" });
    });

    it("handles tab closure mid-sync without crashing open tab", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();
        createSyncedStore({ value: "open" });

        const tabB = new MockBroadcastChannel(channel);
        tabB.close();

        setStore(storeName, { value: "after-close" });
        await flushMicrotasks(8);

        expect(getStore(storeName)).toEqual({ value: "after-close" });
    });

    it("survives rapid sync storm (50 msgs/sec equivalent) and converges", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();
        createSyncedStore({ value: 0 });

        const peer = new MockBroadcastChannel(channel);
        for (let i = 1; i <= 50; i += 1) {
            peer.postMessage({
                v: 1,
                protocol: 1,
                type: "sync-state",
                name: storeName,
                clock: i,
                source: "storm-peer",
                updatedAt: Date.now() + i,
                data: { value: i },
                checksum: null,
            } satisfies SyncMessage);
        }
        await flushMicrotasks(20);

        expect(getStore(storeName)).toEqual({ value: 50 });
    });
});

