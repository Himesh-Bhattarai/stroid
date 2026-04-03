/**
 * Deterministic mocks used by stress tests.
 *
 * WHAT: Local storage and BroadcastChannel mocks with explicit lifecycle controls.
 * WHY: Production race-condition and corruption tests need deterministic transport/storage behavior in CI.
 */
import { vi } from "vitest";

export type StorageDriverLike = {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
};

export const createMemoryStorageDriver = (initial: Record<string, string> = {}): StorageDriverLike & {
    dump: () => Record<string, string>;
} => {
    const map = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
            map.set(key, value);
        },
        removeItem: (key: string) => {
            map.delete(key);
        },
        dump: () => Object.fromEntries(map.entries()),
    };
};

type MockMessageEvent<T = unknown> = { data: T };

const clonePayload = <T,>(value: T): T => {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

export class MockBroadcastChannel {
    private static channels = new Map<string, Set<MockBroadcastChannel>>();
    private static posted: Array<{ channel: string; data: unknown }> = [];

    readonly name: string;
    closed = false;
    onmessage: ((event: MockMessageEvent) => void) | null = null;
    onmessageerror: ((event: Event) => void) | null = null;

    constructor(name: string) {
        this.name = name;
        const peers = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>();
        peers.add(this);
        MockBroadcastChannel.channels.set(name, peers);
    }

    postMessage(data: unknown): void {
        if (this.closed) throw new Error("BroadcastChannel is closed");
        const peers = MockBroadcastChannel.channels.get(this.name) ?? new Set<MockBroadcastChannel>();
        const payload = clonePayload(data);
        MockBroadcastChannel.posted.push({ channel: this.name, data: payload });
        peers.forEach((peer) => {
            if (peer === this || peer.closed) return;
            queueMicrotask(() => {
                peer.onmessage?.({ data: payload });
            });
        });
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        const peers = MockBroadcastChannel.channels.get(this.name);
        peers?.delete(this);
        if (peers && peers.size === 0) {
            MockBroadcastChannel.channels.delete(this.name);
        }
    }

    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean { return true; }

    static reset(): void {
        MockBroadcastChannel.channels.clear();
        MockBroadcastChannel.posted = [];
    }

    static activeChannelCount(name?: string): number {
        if (name == null) {
            let total = 0;
            MockBroadcastChannel.channels.forEach((set) => { total += set.size; });
            return total;
        }
        return MockBroadcastChannel.channels.get(name)?.size ?? 0;
    }

    static messages(channel?: string): Array<{ channel: string; data: unknown }> {
        if (channel == null) return [...MockBroadcastChannel.posted];
        return MockBroadcastChannel.posted.filter((entry) => entry.channel === channel);
    }
}

export const installMockBroadcastChannel = (): void => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel as unknown as typeof BroadcastChannel);
};

export const flushMicrotasks = async (turns = 3): Promise<void> => {
    for (let i = 0; i < turns; i += 1) {
        await Promise.resolve();
    }
};

export const flushTimersAndMicrotasks = async (): Promise<void> => {
    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();
};

export const createDeepObject = (depth: number): Record<string, unknown> => {
    const root: Record<string, unknown> = { value: 0 };
    let cursor = root;
    for (let i = 0; i < depth; i += 1) {
        const next: Record<string, unknown> = { value: i + 1 };
        cursor[`level${i}`] = next;
        cursor = next;
    }
    return root;
};

export const createFlatObject = (size: number): Record<string, number> => {
    const out: Record<string, number> = {};
    for (let i = 0; i < size; i += 1) {
        out[`k${i}`] = i;
    }
    return out;
};
