/**
 * @module hooks-form
 *
 * LAYER: React hooks
 * OWNS:  Module-level behavior and exports for hooks-form.
 *
 * Consumers: Internal imports and public API.
 */
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
} from "./store-lifecycle/types.js";

type StoreSnapshot<T> = T extends object ? Readonly<T> : T;

type StoreInput<Name extends string, State> =
    | StoreDefinition<Name, State>
    | StoreKey<Name, State>
    | (Name extends StoreName ? Name : never);
type StoreState<Name extends string, State> =
    Name extends StoreName ? StateFor<Name> : State;

export function useFormStore<Name extends string, State, P extends Path<StoreState<Name, State>>>(
    storeName: StoreInput<Name, State>,
    field: P
) {
    const value = useStore(storeName, field);
    const onChange = useCallback(
        (eOrValue: unknown) => {
            const target = (eOrValue as { target?: { type?: string; checked?: boolean; value?: unknown } })?.target;
            const next = target
                ? target.type === "checkbox"
                    ? !!target.checked
                    : target.value
                : eOrValue;
            setStore(storeName, field, next as PathValue<StoreState<Name, State>, P>);
        },
        [storeName, field]
    );
    return { value, onChange };
}


