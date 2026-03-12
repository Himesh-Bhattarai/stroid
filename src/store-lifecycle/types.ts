type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type PrevDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
type PathInternal<T, Depth extends number> = Depth extends 0
    ? never
    : T extends Primitive
        ? never
        : {
            [K in keyof T & (string | number)]: T[K] extends Primitive | Array<unknown>
                ? `${K}`
                : `${K}` | `${K}.${PathInternal<T[K], PrevDepth[Depth]>}`
        }[keyof T & (string | number)];

export type PathDepth<T, Depth extends number> = PathInternal<T, Depth>;
export type Path<T, Depth extends number = 10> = PathInternal<T, Depth>;

export type PathValue<T, P extends Path<T>> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
        ? Rest extends Path<T[K]>
            ? PathValue<T[K], Rest>
            : never
        : never
    : P extends keyof T
        ? T[P]
        : never;

export type PartialDeep<T> = T extends Primitive
    ? T
    : { [K in keyof T]?: PartialDeep<T[K]> };

export type StoreValue = unknown;

// Ambient map users can augment to get typed string access to stores.
// Example:
//   declare module "stroid" { interface StoreStateMap { user: UserState } }
export interface StoreStateMap {}
// Optional strict map users can augment to disallow unknown store names.
// Example:
//   declare module "stroid" { interface StrictStoreMap { user: UserState } }
export interface StrictStoreMap {}
type StrictStoreEnabled = [keyof StrictStoreMap] extends [never] ? false : true;
type StrictStoreName = keyof StrictStoreMap & string;
type LooseStoreName = [keyof StoreStateMap] extends [never] ? string : keyof StoreStateMap & string;
export type StoreName = StrictStoreEnabled extends true ? StrictStoreName : LooseStoreName;
export type StateFor<Name extends string> = StrictStoreEnabled extends true
    ? (Name extends keyof StrictStoreMap ? StrictStoreMap[Name] : never)
    : (Name extends keyof StoreStateMap ? StoreStateMap[Name] : StoreValue);
export type UnregisteredStoreName<Name extends string> =
    StrictStoreEnabled extends true ? never : (Name extends StoreName ? never : Name);

// A typed store handle that still matches the runtime StoreDefinition shape.
export type StoreKey<Name extends string = string, State = StoreValue> =
    StoreDefinition<Name, State> & { __store?: true };

export interface StoreDefinition<Name extends string = string, State = StoreValue> {
    name: Name;
    // marker for inference only, not used at runtime
    state?: State;
}

export type WriteResult =
    | { ok: true }
    | { ok: false; reason: "not-found" | "validate" | "path" | "middleware" | "ssr" | "invalid-args" };

export type Subscriber = (value: StoreValue | null) => void;
