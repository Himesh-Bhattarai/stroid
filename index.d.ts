// Type definitions for stroid

export type StorageLike = {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
  [key: string]: any;
};

type Primitive = string | number | boolean | null | undefined | symbol | bigint;

export type PersistOptions = {
  storage?: StorageLike;
  driver?: StorageLike;
  key?: string;
  serialize?: (value: any) => string;
  deserialize?: (value: string) => any;
  encrypt?: (value: string) => string;
  decrypt?: (value: string) => string;
};

export type MiddlewareCtx = {
  action: string;
  name: string;
  prev: any;
  next: any;
  path: string | string[] | undefined;
};

export type StoreOptions = {
  persist?: boolean | string | PersistOptions;
  devtools?: boolean;
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
  sync?: boolean | { channel?: string };
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

export function createStore<T>(name: string, initialData: T, options?: StoreOptions): T;
export function setStore<T>(name: string, keyOrData: Path<T> | Path<T>[] | Partial<T> | ((draft: T) => void), value?: any): void;
export function setStoreBatch(fn: () => void): void;
export function getStore<T = any, P extends Path<T> = Path<T>>(name: string, path?: P | string | string[]): PathValue<T, P> | T | null;
export function deleteStore(name: string): void;
export function resetStore(name: string): void;
export function mergeStore<T extends object>(name: string, data: Partial<T>): void;
export function clearAllStores(): void;
export function hasStore(name: string): boolean;
export function listStores(): string[];
export function getStoreMeta(name: string): any;
export function subscribeWithSelector<T = any, R = any>(name: string, selector: (state: T) => R, equality?: (a: R, b: R) => boolean, listener?: (next: R, prev: R) => void): () => void;

export function createSelector<TState, TResult>(name: string, selector: (state: TState) => TResult): () => TResult | null;
export function createCounterStore(name: string, initial?: number, options?: StoreOptions): {
  inc: (n?: number) => void;
  dec: (n?: number) => void;
  set: (v: number) => void;
  reset: () => void;
  get: () => number | null;
};
export function createListStore<T>(name: string, initial?: T[], options?: StoreOptions): {
  push: (item: T) => void;
  removeAt: (index: number) => void;
  clear: () => void;
  replace: (items: T[]) => void;
  all: () => T[] | null;
};
export function createEntityStore<T extends { id?: string; _id?: string }>(name: string, options?: StoreOptions): {
  upsert: (entity: T) => void;
  remove: (id: string) => void;
  all: () => T[];
  get: (id: string) => T | null;
  clear: () => void;
};

export function getInitialState(): any;
export function getHistory(name: string, limit?: number): any[];
export function clearHistory(name?: string): void;
export function getMetrics(name: string): { notifyCount: number; totalNotifyMs: number; lastNotifyMs: number } | null;
export function createStoreForRequest(initializer?: (api: { create: (name: string, data: any, options?: StoreOptions) => any; set: (name: string, updater: any) => any; get: (name: string) => any }) => void): {
  snapshot: () => any;
  hydrate: (options?: Record<string, StoreOptions> & { default?: StoreOptions }) => void;
};
export function hydrateStores(snapshot: any, options?: Record<string, StoreOptions> & { default?: StoreOptions }): void;

export function createZustandCompatStore<T>(initializer: (set: (partial: Partial<T>, replace?: boolean) => void, get: () => T, api: any) => T, options?: StoreOptions & { name?: string }): {
  setState: (partial: Partial<T>, replace?: boolean) => void;
  getState: () => T;
  subscribe: (listener: (state: T | null) => void) => () => void;
  subscribeWithSelector: (selector: (state: T) => any, equality?: (a: any, b: any) => boolean, listener?: (next: any, prev: any) => void) => () => void;
  destroy: () => void;
};

// Async helpers
export type FetchOptions = {
  transform?: (result: any) => any;
  onSuccess?: (data: any) => void;
  onError?: (message: string) => void;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  ttl?: number;
  staleWhileRevalidate?: boolean;
  dedupe?: boolean;
  retry?: number;
  retryDelay?: number;
  retryBackoff?: number;
  signal?: AbortSignal;
  cacheKey?: string;
};

export function fetchStore(name: string, urlOrPromise: string | Promise<any>, options?: FetchOptions): Promise<any>;
export function refetchStore(name: string): Promise<any>;
export function getAsyncMetrics(): {
  cacheHits: number;
  cacheMisses: number;
  dedupes: number;
  requests: number;
  failures: number;
  avgMs: number;
  lastMs: number;
};

// React hooks
export function useStore<T = any>(name: string, path?: string): T | null;
export function useStoreField<T = any>(name: string, field: string): T | null;
export function useSelector<T = any, R = any>(name: string, selector: (state: T) => R, equalityFn?: (a: R, b: R) => boolean): R | null;
export function useAsyncStore(name: string): {
  data: any;
  loading: boolean;
  error: string | null;
  status: string;
  isEmpty: boolean;
};
export function useStoreStatic<T = any>(name: string, path?: string): T | null;
export function useFormStore<T = any>(name: string, field: string): { value: T | null; onChange: (e: any) => void };

// chain API
export function chain(name: string): any;

// testing helpers
export function createMockStore(name?: string, initial?: any): { set: (update: any) => void; reset: () => void; use: () => { name: string } };
export function withMockedTime<T>(nowMs: number, fn: () => T): T;
export function resetAllStoresForTest(): void;
export function benchmarkStoreSet(name: string, iterations?: number, makeUpdate?: (i: number) => any): { iterations: number; totalMs: number; avgMs: number };
