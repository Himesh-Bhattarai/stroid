import { useCallback } from "react";
import { useStore } from "./hooks-core.js";
import { setStore } from "./store.js";
import type {
    Path,
    PathValue,
    StoreDefinition,
    StoreKey,
    StoreName,
    StateFor,
} from "./store-lifecycle.js";

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;

export function useFormStore<Name extends string, State, P extends Path<State>>(
    storeName: StoreDefinition<Name, State> | StoreKey<Name, State>,
    field: P
): { value: StoreSnapshot<PathValue<State, P>> | null; onChange: (eOrValue: unknown) => void };
export function useFormStore<Name extends StoreName, P extends Path<StateFor<Name>>>(
    storeName: Name,
    field: P
): { value: StoreSnapshot<PathValue<StateFor<Name>, P>> | null; onChange: (eOrValue: unknown) => void };
export function useFormStore(
    storeName: StoreDefinition<string, unknown> | StoreKey<string, unknown> | StoreName,
    field: string
) {
    const value = useStore(storeName as any, field as any);
    const onChange = useCallback(
        (eOrValue: unknown) => {
            const target = (eOrValue as { target?: { type?: string; checked?: boolean; value?: unknown } })?.target;
            const next = target
                ? target.type === "checkbox"
                    ? !!target.checked
                    : target.value
                : eOrValue;
            setStore(storeName as any, field as any, next as any);
        },
        [storeName, field]
    );
    return { value, onChange };
}
