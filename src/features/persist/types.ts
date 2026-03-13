import type { PersistConfig, StoreValue } from "../../adapters/options.js";

export type PersistWatchEntry = { lastPresent: boolean; dispose: () => void };
export type PersistWatchState = Record<string, PersistWatchEntry>;
export type PersistTimers = Record<string, ReturnType<typeof setTimeout>>;
export type PersistInFlight = Record<string, Promise<void> | null>;

export type PersistMeta = {
    version: number;
    updatedAt: string;
    options: {
        persist: PersistConfig | null;
        migrations: Record<number, (state: any) => any>;
        onError?: (err: string) => void;
    };
};

export type PersistLoadArgs = {
    name: string;
    silent?: boolean;
    getMeta: () => PersistMeta | undefined;
    getInitialState: () => StoreValue;
    applyFeatureState: (value: StoreValue, updatedAtMs?: number) => void;
    reportStoreError: (name: string, message: string) => void;
    validate: (next: StoreValue) => { ok: boolean; value?: StoreValue };
    log: (message: string) => void;
    hashState: (value: unknown) => number;
    deepClone: <T>(value: T) => T;
    sanitize: (value: unknown) => unknown;
};

export type PersistSaveArgs = {
    name: string;
    persistTimers: PersistTimers;
    persistInFlight: PersistInFlight;
    persistWatchState: PersistWatchState;
    plaintextWarningsIssued: Set<string>;
    exists: () => boolean;
    getMeta: () => PersistMeta | undefined;
    getStoreValue: () => StoreValue;
    reportStoreError: (name: string, message: string) => void;
    hashState: (value: unknown) => number;
};
