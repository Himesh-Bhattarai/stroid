import { useEffect, useState, useCallback } from "react";
import { _subscribe, subscribeWithSelector, _getSnapshot, hasStore, setStore } from "./store.js";
import { warn } from "./utils.js";

const pickPath = (data, path) => {
    if (!path) return data;
    const parts = path.split(".");
    let current = data;
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        current = current[part];
    }
    return current ?? null;
};

export const useStore = (name, path) => {
    const getSnapshot = useCallback(() => {
        const data = _getSnapshot(name);
        if (data === null || data === undefined) return null;
        return pickPath(data, path);
    }, [name, path]);

    const [state, setState] = useState(getSnapshot);

    useEffect(() => {
        setState(getSnapshot());

        if (!hasStore(name)) {
            warn(
                `useStore("${name}") - store not found yet.\n` +
                `Component will update automatically when createStore("${name}") is called.`
            );
        }

        const unsubscribe = _subscribe(name, (newData) => {
            if (newData === null) { setState(null); return; }
            const next = pickPath(newData, path);
            setState(next);
        });

        return unsubscribe;
    }, [name, path, getSnapshot]);

    return state;
};

export const useStoreField = (storeName, field) => {
    return useStore(storeName, field);
};

export const useSelector = (storeName, selectorFn, equalityFn = Object.is) => {
    const compute = useCallback(() => {
        const data = _getSnapshot(storeName);
        if (data === null || data === undefined) return null;
        return selectorFn(data);
    }, [storeName, selectorFn]);

    const [selection, setSelection] = useState(compute);

    useEffect(() => {
        setSelection(compute());
        const unsubscribe = subscribeWithSelector(
            storeName,
            (state) => selectorFn(state ?? {}),
            equalityFn,
            (next, prev) => setSelection((current) => (equalityFn(current, next) ? current : next))
        );
        return unsubscribe;
    }, [storeName, selectorFn, equalityFn, compute]);

    return selection;
};

export const useAsyncStore = (name) => {
    const store = useStore(name);

    return {
        data: store?.data ?? null,
        loading: store?.loading ?? false,
        error: store?.error ?? null,
        status: store?.status ?? "idle",
        isEmpty: !store?.data && !store?.loading && !store?.error,
    };
};

export const useStoreStatic = (name, path) => {
    const data = _getSnapshot(name);
    if (data === null || data === undefined) return null;
    return pickPath(data, path);
};

export const useFormStore = (storeName, field) => {
    const value = useStore(storeName, field);
    const onChange = useCallback(
        (eOrValue) => {
            const next = eOrValue?.target ? eOrValue.target.value : eOrValue;
            setStore(storeName, field, next);
        },
        [storeName, field]
    );
    return { value, onChange };
};
