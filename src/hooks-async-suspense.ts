import { useMemo } from "react";
import { subscribeStore } from "./store.js";
import { useAsyncStore } from "./hooks-async.js";

const _waitForStore = (name: string): Promise<void> =>
    new Promise((resolve) => {
        const unsub = subscribeStore(name, (state) => {
            if (state && typeof state === "object" && !(state as any).loading) {
                unsub();
                resolve();
            }
        });
    });

export const useAsyncStoreSuspense = <T = any>(name: string): T => {
    const snapshot = useAsyncStore(name);
    const pending = snapshot.loading || snapshot.status === "idle";
    const promise = useMemo(() => (pending ? _waitForStore(name) : null), [name, pending]);
    if (promise) throw promise;
    if (snapshot.error) throw new Error(snapshot.error);
    return snapshot.data as T;
};
