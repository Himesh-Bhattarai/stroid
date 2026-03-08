// Type definitions for stroid

export type StorageLike = {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
  [key: string]: any;
};

type Primitive = string | number | boolean | null | undefined | symbol | bigint;

export type StoreScope = "request" | "global" | "temp";

export type PersistOptions = {
  storage?: StorageLike;
  driver?: StorageLike;
  key?: string;
  serialize?: (value: any) => string;
  deserialize?: (value: string) => any;
  encrypt?: (value: string) => string;
  decrypt?: (value: string) => string;
  version?: number;
  migrations?: Record<number, (state: any) => any>;
  onMigrationFail?: "reset" | "keep" | ((state: unknown) => unknown);
  onStorageCleared?: (args: { name: string; key: string; reason: "clear" | "remove" | "missing" }) => void;
};

export type StoreDefinition<Name extends string = string, State = unknown> = {
  name: Name;
  state?: State;
};

export type MiddlewareCtx = {
  action: string;
  name: string;
  prev: any;
  next: any;
  path: string | string[] | undefined;
};

export type SyncOptions = {
  channel?: string;
  maxPayloadBytes?: number;
  conflictResolver?: (args: {
    local: any;
    incoming: any;
    localUpdated: number;
    incomingUpdated: number;
  }) => any | void;
};

export type DevtoolsOptions = {
  enabled?: boolean;
  historyLimit?: number;
  redactor?: (state: any) => any;
};

export type LifecycleOptions = {
  middleware?: Array<(ctx: MiddlewareCtx) => any | void>;
  onSet?: (prev: any, next: any) => void;
  onReset?: (prev: any, next: any) => void;
  onDelete?: (prev: any) => void;
  onCreate?: (initial: any) => void;
};

export type StoreOptions = {
  scope?: StoreScope;
  validate?: any | ((next: any) => boolean);
  persist?: boolean | string | PersistOptions;
  devtools?: boolean | DevtoolsOptions;
  lifecycle?: LifecycleOptions;
  middleware?: Array<(ctx: MiddlewareCtx) => any | void>;
  onSet?: (prev: any, next: any) => void;
  onReset?: (prev: any, next: any) => void;
  onDelete?: (prev: any) => void;
  onCreate?: (initial: any) => void;
  onError?: (err: string) => void;
  validator?: (next: any) => boolean;
  schema?: any; // zod/yup/json-schema/validator fn
  migrations?: Record<number, (state: any) => any>;
  version?: number;
  redactor?: (state: any) => any;
  historyLimit?: number;
  allowSSRGlobalStore?: boolean;
  sync?: boolean | SyncOptions;
};

type PathImpl<T, K extends keyof T> =
  K extends string
    ? T[K] extends Primitive
      ? K
      : T[K] extends Array<any>
        ? K
        : `${K}` | `${K}.${Path<T[K]>}`
    : never;

export type Path<T> = T extends Primitive ? never : PathImpl<T, keyof T>;
export type PathValue<T, P extends Path<T>> =
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? Rest extends Path<T[K]>
        ? PathValue<T[K], Rest>
        : never
      : never
    : P extends keyof T
      ? T[P]
      : any;

export function createStore<Name extends string, T>(name: Name, initialData: T, options?: StoreOptions): StoreDefinition<Name, T> | undefined;
export function setStore<T>(name: string, keyOrData: Path<T> | Path<T>[] | Partial<T> | ((draft: T) => void), value?: any): void;
export function setStoreBatch(fn: () => void): void;
export function getStore<T = any, P extends Path<T> = Path<T>>(name: string, path?: P | string | string[]): PathValue<T, P> | T | null;
export function deleteStore(name: string): void;
export function resetStore(name: string): void;
export function mergeStore<T extends object>(name: string, data: Partial<T>): void;
export function hasStore(name: string): boolean;
export function hydrateStores(snapshot: any, options?: Record<string, StoreOptions> & { default?: StoreOptions }): void;
