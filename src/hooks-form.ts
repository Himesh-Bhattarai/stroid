import { useCallback } from "react";
import { useStore } from "./hooks-core.js";
import { setStore } from "./store.js";

export const useFormStore = <T = any>(storeName: string, field: string) => {
    const value = useStore<T>(storeName, field);
    const onChange = useCallback(
        (eOrValue: any) => {
            const target = eOrValue?.target;
            const next = target
                ? target.type === "checkbox"
                    ? !!target.checked
                    : target.value
                : eOrValue;
            setStore(storeName, field, next);
        },
        [storeName, field]
    );
    return { value, onChange };
};
