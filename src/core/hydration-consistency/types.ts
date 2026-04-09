/**
 * @module hydration-consistency/types
 *
 * LAYER: Store runtime
 * OWNS:  Public and internal types for post-hydration consistency handling.
 *
 * Consumers: hydration-consistency runtime modules and public barrels.
 */
export type HydrationConsistencySource =
    | "effect"
    | "storage"
    | "network"
    | "sync"
    | "hydrate"
    | "unknown";

export type HydrationConsistencyAuthority =
    | "server-authoritative"
    | "client-authoritative"
    | "mergeable";

/**
 * How the post-hydration boot window is controlled.
 * - `timer`: closes automatically after a configured duration.
 * - `manual`: stays open until `close()` is called, optionally with a fallback timer.
 */
export type HydrationBootWindowMode = "timer" | "manual";

/**
 * Boot-window configuration for post-hydration write deferral.
 *
 * `timer` mode uses `ms` to guess when hydration should be considered settled.
 * `manual` mode returns a `HydrationBootWindowControl` so the app can close the window explicitly.
 * `fallbackMs` can be used as a safety timer while still preferring manual close.
 */
export type HydrationBootWindowOptions =
    | HydrationBootWindowMode
    | {
        mode: HydrationBootWindowMode;
        ms?: number;
        fallbackMs?: number;
    };

/**
 * Runtime control returned from `hydrateStores(...)` when a boot window is active.
 */
export type HydrationBootWindowControl = {
    mode: HydrationBootWindowMode;
    startedAtMs: number | null;
    endsAtMs: number | null;
    close: () => void;
    isActive: () => boolean;
};

export type HydrationConsistencyPolicy =
    | "server_wins"
    | "client_wins"
    | "merge"
    | "invalidate_and_refetch";

export type HydrationConsistencyResolution =
    | "stable"
    | "server_reverted"
    | "client_kept"
    | "merged"
    | "invalidated";

export type HydrationSnapshotMetadata = {
    snapshotVersion?: string | number;
    timestamp?: number;
    checksum?: string | number;
    schemaSignature?: string;
};

export type HydrationConsistencyStoreContract = HydrationSnapshotMetadata & {
    authority?: HydrationConsistencyAuthority;
};

export type HydrationConsistencyContract<Snapshot extends object = Record<string, unknown>> =
    HydrationSnapshotMetadata & {
        authority?: HydrationConsistencyAuthority;
        stores?: Partial<{
            [K in keyof Snapshot & string]: HydrationConsistencyStoreContract;
        }>;
    };

export type HydrationInvalidateArgs<State = unknown> = {
    store: string;
    baseline: State;
    live: State;
    source: HydrationConsistencySource;
};

export type HydrationMergeArgs<State = unknown> = {
    store: string;
    baseline: State;
    live: State;
    source: HydrationConsistencySource;
};

export type HydrationConsistencyStorePolicy<State = unknown> =
    | HydrationConsistencyPolicy
    | {
        policy: HydrationConsistencyPolicy;
        merge?: (args: HydrationMergeArgs<State>) => State;
        onInvalidate?: (args: HydrationInvalidateArgs<State>) => void;
    };

export type HydrationDriftEvent<Snapshot extends object = Record<string, unknown>> = {
    id: string;
    store: keyof Snapshot & string | string;
    source: HydrationConsistencySource;
    authority: HydrationConsistencyAuthority;
    policy: HydrationConsistencyPolicy;
    resolution: HydrationConsistencyResolution;
    detectedAt: string;
    detectedAtMs: number;
    firstDivergedAt: string;
    firstDivergedAtMs: number;
    hydratedAt: string;
    hydratedAtMs: number;
    baselineHash: number;
    liveHash: number;
    resolvedHash: number;
    invalidated: boolean;
    metadata: HydrationSnapshotMetadata;
    baseline: unknown;
    live: unknown;
    resolved: unknown;
};

export type HydrationConsistencyOptions<Snapshot extends object = Record<string, unknown>> = {
    contract?: HydrationConsistencyContract<Snapshot>;
    policyMap?: Partial<{
        [K in keyof Snapshot & string]: HydrationConsistencyStorePolicy<Snapshot[K]>;
    }>;
    onDrift?: (event: HydrationDriftEvent<Snapshot>) => void;
    /**
     * Legacy timer shorthand for the hydration boot window.
     * Prefer `bootWindow` for explicit timer or manual mode.
     */
    bootWindowMs?: number;
    /**
     * Preferred boot-window configuration for post-hydration write deferral.
     */
    bootWindow?: HydrationBootWindowOptions;
    deferSources?: readonly HydrationConsistencySource[];
    maxEvents?: number;
};

export type InternalStorePolicy = {
    policy: HydrationConsistencyPolicy;
    merge?: (args: HydrationMergeArgs) => unknown;
    onInvalidate?: (args: HydrationInvalidateArgs) => void;
};

export type HydrationConsistencyStoreState = HydrationSnapshotMetadata & {
    store: string;
    authority: HydrationConsistencyAuthority;
    policy: HydrationConsistencyPolicy;
    baseline: unknown;
    baselineHash: number;
    hydratedAt: string;
    hydratedAtMs: number;
    firstDivergedAt: string | null;
    firstDivergedAtMs: number | null;
    lastDivergedAt: string | null;
    lastDivergedAtMs: number | null;
    lastResolution: HydrationConsistencyResolution | null;
    lastSource: HydrationConsistencySource | null;
    driftCount: number;
    queuedWrites: number;
    replayedWrites: number;
    invalidatedAt: string | null;
    invalidatedAtMs: number | null;
    currentHash: number;
    merge?: (args: HydrationMergeArgs) => unknown;
    onInvalidate?: (args: HydrationInvalidateArgs) => void;
};

export type HydrationConsistencyMetrics = {
    driftEvents: number;
    queuedWrites: number;
    replayedWrites: number;
    reconciliations: number;
    invalidations: number;
};

export type HydrationDeferredWrite = {
    id: number;
    store: string;
    source: HydrationConsistencySource;
    enqueuedAtMs: number;
    apply: () => void;
};

export type HydrationRuntimeState = {
    stores: Record<string, HydrationConsistencyStoreState>;
    events: HydrationDriftEvent[];
    metrics: HydrationConsistencyMetrics;
    queue: HydrationDeferredWrite[];
    onDrift: ((event: HydrationDriftEvent) => void) | null;
    maxEvents: number;
    deferSources: Set<HydrationConsistencySource>;
    bootWindowMode: HydrationBootWindowMode | null;
    bootWindowActive: boolean;
    bootWindowStartedAtMs: number | null;
    bootWindowEndsAtMs: number | null;
    bootWindowTimer: ReturnType<typeof setTimeout> | null;
    bootWindowToken: number | null;
    replaying: boolean;
    sequence: number;
};

export type HydrationReconcileResult = {
    value: unknown;
    event: HydrationDriftEvent | null;
    invalidated: boolean;
    needsRefetch: boolean;
};
