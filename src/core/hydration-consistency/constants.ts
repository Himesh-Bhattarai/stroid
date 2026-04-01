/**
 * @module hydration-consistency/constants
 *
 * LAYER: Store runtime
 * OWNS:  Shared defaults for hydration consistency behavior.
 *
 * Consumers: hydration-consistency runtime modules.
 */
import type { HydrationConsistencySource } from "./types.js";

export const DEFAULT_DEFER_SOURCES: ReadonlyArray<HydrationConsistencySource> = [
    "effect",
    "storage",
    "network",
    "sync",
];

export const DEFAULT_MAX_EVENTS = 50;
