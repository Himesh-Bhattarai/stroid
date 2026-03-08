import { useStore } from "./hooks-core.js";

export const useAsyncStore = (name: string): {
    data: unknown;
    loading: boolean;
    revalidating: boolean;
    error: string | null;
    status: "idle" | "loading" | "success" | "error" | "aborted";
    isEmpty: boolean;
} => {
    const store = useStore<any>(name);
    return {
        data: store?.data ?? null,
        loading: store?.loading ?? false,
        revalidating: store?.revalidating ?? false,
        error: store?.error ?? null,
        status: store?.status ?? "idle",
        isEmpty: store?.data == null && !store?.loading && !store?.error,
    };
};
