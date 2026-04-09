/**
 * @module hydration-consistency/index
 *
 * LAYER: Store runtime
 * OWNS:  Folder barrel for post-hydration consistency modules.
 *
 * Consumers: top-level hydration-consistency barrel.
 */
export type * from "./types.js";
export {
    createHydrationRuntimeState,
    resetHydrationRuntimeState,
    closeHydrationBootWindow,
    getHydrationBootWindowControl,
    initializeHydrationConsistency,
    shouldQueueHydrationWrite,
    enqueueHydrationWrite,
    flushHydrationWriteQueue,
} from "./state.js";
export {
    getHydrationStoreState,
    getHydrationStoreStates,
    getHydrationDriftEvents,
    getHydrationMetrics,
} from "./reports.js";
export {
    reconcileHydrationValue,
    runHydrationInvalidationHandler,
} from "./reconcile.js";
