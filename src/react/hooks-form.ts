/**
 * @module react/hooks-form
 *
 * LAYER: React hooks
 * OWNS:  Module-level behavior and exports for react/hooks-form.
 *
 * Consumers: Internal imports and public API.
 */
import { useCallback } from "react";
import { useStoreField } from "./hooks-core.js";
import { setStore } from "../store-write.js";
import { getDefaultStoreRegistry, runWithRegistry } from "../store-registry.js";
import { useRegistryContext } from "./registry.js";
import type {
    Path,
    PathValue,
    StoreDefinition,
    StoreKey,
    StoreName,
    StoreValue,
    StateFor,
} from "../store-lifecycle/types.js";

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;

type FormResult<Value> = { value: StoreSnapshot<Value> | null; onChange: (eOrValue: unknown) => void };
const resolveInputValue = (eOrValue: unknown): unknown => {
    const target = (eOrValue as { target?: { type?: string; checked?: boolean; value?: unknown } })?.target;
    if (!target) return eOrValue;
    return target.type === "checkbox" ? !!target.checked : target.value;
};

export function useFormStore<Name extends string, State, P extends Path<State>>(
    storeName: StoreDefinition<Name, State> | StoreKey<Name, State>,
    field: P
): FormResult<PathValue<State, P>>;
export function useFormStore<Name extends StoreName, P extends Path<StateFor<Name>>>(
    storeName: Name,
    field: P
): FormResult<PathValue<StateFor<Name>, P>>;
export function useFormStore(
    storeName: StoreDefinition<string, StoreValue> | StoreKey<string, StoreValue> | StoreName,
    field: string
): FormResult<unknown> {
    const registry = useRegistryContext() ?? getDefaultStoreRegistry();
    if (typeof storeName === "string") {
        const resolvedPath = field as Path<StateFor<StoreName>>;
        const value = useStoreField(storeName as StoreName, resolvedPath);
        const onChange = useCallback(
            (eOrValue: unknown) => {
                const next = resolveInputValue(eOrValue) as PathValue<StateFor<StoreName>, typeof resolvedPath>;
                runWithRegistry(registry, () => {
                    setStore(storeName as StoreName, resolvedPath, next);
                });
            },
            [registry, storeName, resolvedPath]
        );
        return { value, onChange };
    }

    const handlePath = field as Path<Record<string, unknown>>;
    const handle = storeName as StoreDefinition<string, Record<string, unknown>>
        | StoreKey<string, Record<string, unknown>>;
    const value = useStoreField(handle, handlePath);
    const onChange = useCallback(
        (eOrValue: unknown) => {
            const next = resolveInputValue(eOrValue) as PathValue<Record<string, unknown>, typeof handlePath>;
            runWithRegistry(registry, () => {
                setStore(handle, handlePath, next);
            });
        },
        [registry, handle, handlePath]
    );
    return { value, onChange };
}


