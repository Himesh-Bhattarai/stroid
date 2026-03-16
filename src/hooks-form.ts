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
import { setStore } from "./store.js";
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

type AnyState = Record<string, unknown>;
type AnyPath = Path<AnyState>;
type StoreInput<Name extends string, State> =
    | StoreDefinition<Name, State>
    | StoreKey<Name, State>;
const toAnyHandle = (
    value: StoreDefinition<string, StoreValue> | StoreKey<string, StoreValue> | StoreName
): StoreDefinition<string, AnyState> | StoreKey<string, AnyState> =>
    (typeof value === "string" ? { name: value } : value) as StoreDefinition<string, AnyState> | StoreKey<string, AnyState>;

export function useFormStore<Name extends string, State, P extends Path<State>>(
    storeName: StoreInput<Name, State>,
    field: P
): { value: StoreSnapshot<PathValue<State, P>> | null; onChange: (eOrValue: unknown) => void };
export function useFormStore<Name extends StoreName, P extends Path<StateFor<Name>>>(
    storeName: Name,
    field: P
): { value: StoreSnapshot<PathValue<StateFor<Name>, P>> | null; onChange: (eOrValue: unknown) => void };
export function useFormStore(
    storeName: StoreDefinition<string, StoreValue> | StoreKey<string, StoreValue> | StoreName,
    field: string
): { value: unknown; onChange: (eOrValue: unknown) => void } {
    const value = useStoreField(toAnyHandle(storeName), field as AnyPath);
    const onChange = useCallback(
        (eOrValue: unknown) => {
            const target = (eOrValue as { target?: { type?: string; checked?: boolean; value?: unknown } })?.target;
            const next = target
                ? target.type === "checkbox"
                    ? !!target.checked
                    : target.value
                : eOrValue;
            setStore(toAnyHandle(storeName), field as AnyPath, next as PathValue<AnyState, AnyPath>);
        },
        [storeName, field]
    );
    return { value, onChange };
}


