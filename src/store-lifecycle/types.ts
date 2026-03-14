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
    : unknown extends T
        ? T
        : { [K in keyof T]?: PartialDeep<T[K]> };

export type StoreValue = unknown;

// Ambient map users can augment to get typed string access to stores.
// Example:
//   declare module "stroid" { interface StoreStateMap { user: UserState } }
export interface StoreStateMap {}
// Optional strict map users can augment for explicit, locked store names.
// Example:
//   declare module "stroid" { interface StrictStoreMap { user: UserState } }
//   declare module "stroid/core" { interface StrictStoreMap { user: UserState } }
export interface StrictStoreMap {}
type RegisteredStoreMap = StoreStateMap & StrictStoreMap;
declare const storeNameBrand: unique symbol;
type BrandedStoreName = string & { readonly [storeNameBrand]: true };
export type StoreName = (keyof RegisteredStoreMap & string) | BrandedStoreName;
export type StateFor<Name extends string> =
    Name extends keyof RegisteredStoreMap ? RegisteredStoreMap[Name] : StoreValue;
export type UnregisteredStoreName<Name extends string> = never;

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
