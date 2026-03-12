import type { PersistConfig } from "../../adapters/options.js";
import type { PersistWatchState } from "./types.js";

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

    const readPresent = (): boolean => {
        try {
            return persistConfig.driver.getItem?.(persistConfig.key) != null;
        } catch (_) {
            return false;
        }
    };

    const notifyIfCleared = (reason: "clear" | "remove" | "missing"): void => {
        const state = persistWatchState[name];
        const present = readPresent();
        if (!state) return;
        if (!state.lastPresent || present) {
            state.lastPresent = present;
            return;
        }
        state.lastPresent = false;
        callback({ name, key: persistConfig.key, reason });
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

    persistWatchState[name] = {
        lastPresent: readPresent(),
        dispose: () => {
            hostWindow.removeEventListener("storage", onStorage);
            hostWindow.removeEventListener("focus", onFocus);
        },
    };
};
