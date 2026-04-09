/**
 * Adversarial BroadcastChannel sync stress tests.
 *
 * WHAT: Sends malformed, unauthenticated, and oversized sync payloads plus clone-failure scenarios.
 * WHY: In production, cross-tab channels can receive hostile or corrupted frames; runtime must fail safely.
 */
import { describe, expect, it, vi } from "vitest";
import { createStore, getStore, setStore } from "stroid";
import { flushMicrotasks, installMockBroadcastChannel, MockBroadcastChannel } from "../shared/mocks";

type SyncStateMessage = {
    v: number;
    protocol: number;
    type: "sync-state";
    name: string;
    clock: number;
    source: string;
    updatedAt: number;
    data: unknown;
    checksum: null;
    token?: string;
};

class CloneErrorBroadcastChannel extends MockBroadcastChannel {
    override postMessage(data: unknown): void {
        const type = (data as { type?: unknown })?.type;
        if (type === "sync-state") {
            const err = new Error("cannot clone payload") as Error & { name: string };
            err.name = "DataCloneError";
            throw err;
        }
        super.postMessage(data);
    }
}

describe("stress sync adversarial payloads", () => {
    it("survives malformed payload storms without corrupting local state", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();

        const errors: string[] = [];
        createStore("sync.adversarial", { value: 0 }, {
            sync: { policy: "insecure", channel: "sync.adversarial", checksum: "none" },
            onError: (message) => errors.push(message),
        });

        const peer = new MockBroadcastChannel("sync.adversarial");
        const malformedPayloads: unknown[] = [
            null,
            123,
            "bad-frame",
            { name: "sync.adversarial" },
            { v: 2, protocol: 2, type: "sync-state", name: "sync.adversarial", source: "peer", clock: 1, data: { value: 1 } },
            { v: 1, protocol: 1, type: "sync-state", name: "sync.adversarial", source: "peer", clock: 2 },
            { v: 1, protocol: 1, type: "sync-state", name: "sync.adversarial", source: "peer", clock: "3", data: { value: 9 }, checksum: 99 },
        ];

        for (let i = 0; i < 500; i += 1) {
            peer.postMessage(malformedPayloads[i % malformedPayloads.length]);
        }
        await flushMicrotasks(40);

        expect(getStore("sync.adversarial")).toEqual({ value: 0 });
        expect(errors.length).toBeGreaterThan(0);
    });

    it("rejects strict-mode token mismatch even with higher incoming clocks", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();

        createStore("sync.auth", { value: "local" }, {
            sync: {
                policy: "strict",
                channel: "sync.auth",
                checksum: "none",
                authToken: "secret",
            },
        });

        const peer = new MockBroadcastChannel("sync.auth");
        peer.postMessage({
            v: 1,
            protocol: 1,
            type: "sync-state",
            name: "sync.auth",
            source: "wrong-token-peer",
            clock: 9999,
            updatedAt: Date.now() + 5000,
            data: { value: "remote" },
            checksum: null,
            token: "not-secret",
        } satisfies SyncStateMessage);

        await flushMicrotasks(10);
        expect(getStore("sync.auth")).toEqual({ value: "local" });
    });

    it("keeps local writes but skips oversized sync payload broadcasts", async () => {
        installMockBroadcastChannel();
        MockBroadcastChannel.reset();

        const errors: string[] = [];
        createStore("sync.max-payload", { payload: "" }, {
            sync: {
                policy: "insecure",
                channel: "sync.max-payload",
                checksum: "none",
                maxPayloadBytes: 120,
            },
            onError: (message) => errors.push(message),
        });

        const largePayload = "x".repeat(5_000);
        setStore("sync.max-payload", { payload: largePayload });
        await flushMicrotasks(10);

        const syncFrames = MockBroadcastChannel.messages("sync.max-payload")
            .map((entry) => entry.data as { type?: string; data?: { payload?: string } })
            .filter((entry) => entry.type === "sync-state");

        expect((getStore("sync.max-payload") as { payload: string }).payload.length).toBe(largePayload.length);
        expect(syncFrames.some((entry) => entry.data?.payload === largePayload)).toBe(false);
        expect(errors.some((message) => message.includes("exceeds") && message.includes("max-payload"))).toBe(true);
    });

    it("reports DataCloneError from BroadcastChannel without crashing writes", async () => {
        vi.stubGlobal("BroadcastChannel", CloneErrorBroadcastChannel as unknown as typeof BroadcastChannel);
        MockBroadcastChannel.reset();

        const errors: string[] = [];
        createStore("sync.clone-error", { value: 0 }, {
            sync: { policy: "insecure", channel: "sync.clone-error", checksum: "none" },
            onError: (message) => errors.push(message),
        });

        expect(() => {
            setStore("sync.clone-error", { value: 1 });
        }).not.toThrow();
        await flushMicrotasks(8);

        expect(getStore("sync.clone-error")).toEqual({ value: 1 });
        expect(errors.some((message) => message.includes("DataCloneError"))).toBe(true);
    });
});
