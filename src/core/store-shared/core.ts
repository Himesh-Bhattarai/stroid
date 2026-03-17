/**
 * @module store-shared/core
 *
 * LAYER: Shared types
 * OWNS:  Minimal interfaces shared across layers.
 *
 * Consumers: Internal modules (async-cache, adapters).
 */
export interface IStoreCore<T = any> {
    get(path?: string): T | null;
    set(path: string, value: any): void;
    subscribe(cb: (val: T | null) => void): () => void;
}
