import { useStore } from "./hooks-core.js";

export const useAsyncStore = (name: string) => {
    const store = useStore<any>(name);
    return {
        data: store?.data ?? null,
        loading: store?.loading ?? false,
        error: store?.error ?? null,
        status: store?.status ?? "idle",
        isEmpty: !store?.data && !store?.loading && !store?.error,
    };
};
