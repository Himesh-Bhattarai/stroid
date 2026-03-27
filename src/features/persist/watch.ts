/**
 * @module features/persist/watch
 *
 * LAYER: Feature runtime
 * OWNS:  Module-level behavior and exports for features/persist/watch.
 *
 * Consumers: Internal imports and public API.
 */
import type { PersistConfig } from "../../adapters/options.js";
import type { PersistWatchState } from "./types.js";

const isPromiseLike = (value: unknown): value is Promise<unknown> =>
    !!value && typeof (value as { then?: unknown }).then === "function";

export const setPersistPresence = (
    persistWatchState: PersistWatchState,
    name: string,
    present: boolean
): void => {
    if (persistWatchState[name]) {
        persistWatchState[name].lastPresent = present;
    }
};

export const setupPersistWatch = ({
    name,
    persistConfig,
    persistWatchState,
}: {
    name: string;
    persistConfig: PersistConfig | null | undefined;
    persistWatchState: PersistWatchState;
}): void => {
    const callback = persistConfig?.onStorageCleared;
    if (!persistConfig || typeof callback !== "function" || typeof window === "undefined" || typeof window.addEventListener !== "function") return;

    persistWatchState[name]?.dispose();
    const hostWindow = window;

    const readPresent = (): boolean | Promise<boolean> => {
        try {
            const value = persistConfig.driver.getItem?.(persistConfig.key) ?? null;
            if (!isPromiseLike(value)) return value != null;
            return Promise.resolve(value).then(
                (resolved) => resolved != null,
                () => false
            );
        } catch (_) {
            return false;
        }
    };

    const notifyIfCleared = (reason: "clear" | "remove" | "missing"): void => {
        const state = persistWatchState[name];
        if (!state) return;
        const previousPresent = state.lastPresent;
        const applyPresence = (present: boolean): void => {
            const currentState = persistWatchState[name];
            if (!currentState) return;
            if (!previousPresent || present) {
                currentState.lastPresent = present;
                return;
            }
            currentState.lastPresent = false;
            callback({ name, key: persistConfig.key, reason });
        };
        const present = readPresent();
        if (typeof present === "boolean") {
            applyPresence(present);
            return;
        }
        void present.then(applyPresence);
    };

    const onStorage = (event: StorageEvent): void => {
        if (event.key === null) {
            notifyIfCleared("clear");
            return;
        }
        if (event.key === persistConfig.key && event.newValue === null) {
            notifyIfCleared("remove");
        }
    };

    const onFocus = (): void => {
        notifyIfCleared("missing");
    };

    hostWindow.addEventListener("storage", onStorage);
    hostWindow.addEventListener("focus", onFocus);

    const initialPresence = readPresent();
    persistWatchState[name] = {
        lastPresent: typeof initialPresence === "boolean" ? initialPresence : false,
        dispose: () => {
            hostWindow.removeEventListener("storage", onStorage);
            hostWindow.removeEventListener("focus", onFocus);
        },
    };
    if (typeof initialPresence !== "boolean") {
        void initialPresence.then((present) => {
            const state = persistWatchState[name];
            if (state) state.lastPresent = present;
        });
    }
};

