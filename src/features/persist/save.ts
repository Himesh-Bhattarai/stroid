import type { StoreValue } from "../../adapters/options.js";
import { warnAlways } from "../../utils.js";
import { usesDefaultPersistCrypto } from "./crypto.js";
import { setPersistPresence } from "./watch.js";
import type {
    PersistMeta,
    PersistTimers,
    PersistInFlight,
    PersistWatchState,
    PersistSaveArgs,
} from "./types.js";

const persistSaveInner = ({
    name,
    persistTimers,
    persistInFlight,
    persistWatchState,
    plaintextWarningsIssued,
    exists,
    getMeta,
    getStoreValue,
    reportStoreError,
    hashState,
}: {
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
}, immediate = false): void => {
    const cfg = getMeta()?.options?.persist;
    if (!cfg) return;

    const writeNow = async (): Promise<void> => {
        const meta = getMeta();
        if (!meta?.options?.persist || meta.options.persist !== cfg || !exists()) return;

        if (
            !cfg.allowPlaintext
            && !plaintextWarningsIssued.has(name)
            && usesDefaultPersistCrypto(cfg.encrypt)
            && usesDefaultPersistCrypto(cfg.decrypt)
        ) {
            plaintextWarningsIssued.add(name);
            const message =
                `[stroid/persist] Store '${name}' is persisted in plaintext. ` +
                `Provide encrypt/decrypt hooks to protect sensitive data.`;
            meta.options.onError?.(message);
            warnAlways(message);
        }

        try {
            const serialized = cfg.serialize(getStoreValue());
            const checksum = cfg.checksum === "none" ? null : hashState(serialized);
            const envelope = JSON.stringify({
                v: meta.version ?? 1,
                updatedAt: meta.updatedAt,
                checksum,
                data: serialized,
            });
            const payload = cfg.encrypt(envelope);
            await Promise.resolve(cfg.driver.setItem?.(cfg.key, payload));
            setPersistPresence(persistWatchState, name, true);
        } catch (e) {
            reportStoreError(name, `Could not persist store "${name}" (${(e as { message?: string })?.message || e})`);
        }
    };

    const startWrite = (timer?: ReturnType<typeof setTimeout>): void => {
        const prev = persistInFlight[name];
        const run = async (): Promise<void> => {
            if (prev) await prev;
            if (timer && persistTimers[name] !== timer) return;
            await writeNow();
        };

        const promise = run().finally(() => {
            if (persistInFlight[name] === promise) persistInFlight[name] = null;
            if (timer && persistTimers[name] === timer) delete persistTimers[name];
        });
        persistInFlight[name] = promise;
    };

    if (immediate) {
        if (persistTimers[name]) {
            clearTimeout(persistTimers[name]);
            delete persistTimers[name];
        }
        startWrite();
        return;
    }

    if (persistTimers[name]) clearTimeout(persistTimers[name]);
    const timer = setTimeout(() => {
        if (persistTimers[name] !== timer) return;
        startWrite(timer);
    }, 0);
    persistTimers[name] = timer;
};

export const persistSave = (args: PersistSaveArgs): void => persistSaveInner(args);

export const flushPersistImmediately = (name: string, args: PersistSaveArgs): void =>
    persistSaveInner({ ...args, name }, true);
