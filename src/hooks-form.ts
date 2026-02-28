import { useCallback } from "react";
import { useStore } from "./hooks-core.js";
import { setStore } from "./store.js";

export const useFormStore = <T = any>(storeName: string, field: string) => {
    const value = useStore<T>(storeName, field);
    const onChange = useCallback(
        (eOrValue: any) => {
            const next = eOrValue?.target ? eOrValue.target.value : eOrValue;
            setStore(storeName, field, next);
        },
        [storeName, field]
    );
    return { value, onChange };
};
