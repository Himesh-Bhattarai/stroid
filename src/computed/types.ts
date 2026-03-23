/**
 * @module computed/types
 *
 * LAYER: Module
 * OWNS:  Shared public and internal computed graph types.
 *
 * Consumers: Computed registry, runtime tools, and PSR surface.
 */
export type RuntimeNodeId = string;
export type RuntimePathSegment = string | number;

export type ComputedClassification = "deterministic" | "opaque" | "asyncBoundary";

export interface ComputedDescriptor {
    id: RuntimeNodeId;
    storeId: string;
    path: readonly RuntimePathSegment[];
    dependencies: readonly RuntimeNodeId[];
    classification: ComputedClassification;
    asyncBoundary?: boolean;
}
