/**
 * @module hooks-form
 *
 * LAYER: React hooks
 * OWNS:  Module-level behavior and exports for hooks-form.
 *
 * Consumers: Internal imports and public API.
 */
import { useCallback } from "react";
import { useStoreField } from "./hooks-core.js";
import { setStore } from "./store-write.js";
import type {
    Path,
    PathValue,
    StoreDefinition,
    StoreKey,
    StoreName,
    StoreValue,
    StateFor,
} from "./store-lifecycle/types.js";

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;

type StoreInput<Name extends string, State> =
    | StoreDefinition<Name, State>
    | StoreKey<Name, State>;
type FormResult<Value> = { value: StoreSnapshot<Value> | null; onChange: (eOrValue: unknown) => void };
const resolveInputValue = (eOrValue: unknown): unknown => {
    const target = (eOrValue as { target?: { type?: string; checked?: boolean; value?: unknown } })?.target;
    if (!target) return eOrValue;
    return target.type === "checkbox" ? !!target.checked : target.value;
};

const useFormStoreWithHandle = <Name extends string, State, P extends Path<State>>(
    storeName: StoreInput<Name, State>,
    field: P
): FormResult<PathValue<State, P>> => {
    const value = useStoreField(storeName, field);
    const onChange = useCallback(
        (eOrValue: unknown) => {
            const next = resolveInputValue(eOrValue) as PathValue<State, P>;
            setStore(storeName, field, next);
        },
        [storeName, field]
    );
    return { value, onChange };
};

const useFormStoreWithName = <Name extends StoreName, P extends Path<StateFor<Name>>>(
    storeName: Name,
    field: P
): FormResult<PathValue<StateFor<Name>, P>> => {
    const value = useStoreField(storeName, field);
    const onChange = useCallback(
        (eOrValue: unknown) => {
            const next = resolveInputValue(eOrValue) as PathValue<StateFor<Name>, P>;
            setStore(storeName, field, next);
        },
        [storeName, field]
    );
    return { value, onChange };
};

export function useFormStore<Name extends string, State, P extends Path<State>>(
    storeName: StoreInput<Name, State>,
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
    if (typeof storeName === "string") {
        return useFormStoreWithName(
            storeName as StoreName,
            field as Path<StateFor<StoreName>>
        );
    }
    return useFormStoreWithHandle(
        storeName as StoreDefinition<string, Record<string, unknown>> | StoreKey<string, Record<string, unknown>>,
        field as Path<Record<string, unknown>>
    );
}


