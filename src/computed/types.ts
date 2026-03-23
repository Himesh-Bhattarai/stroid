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
export type RuntimeGraphGranularity = "store";
export type RuntimeNodeType = "leaf" | "computed" | "async-boundary";
export type RuntimeEdgeType = "leaf-input" | "computed-input";

export interface RuntimeGraphNode {
    id: RuntimeNodeId;
    storeId: string;
    path: readonly RuntimePathSegment[];
    type: RuntimeNodeType;
    estimatedCost?: number;
}

export interface RuntimeGraphEdge {
    from: RuntimeNodeId;
    to: RuntimeNodeId;
    type: RuntimeEdgeType;
}

export interface RuntimeGraph {
    granularity: RuntimeGraphGranularity;
    nodes: readonly RuntimeGraphNode[];
    edges: readonly RuntimeGraphEdge[];
}

export type ComputedClassification = "deterministic" | "opaque" | "asyncBoundary";

export interface ComputedDescriptor {
    id: RuntimeNodeId;
    storeId: string;
    path: readonly RuntimePathSegment[];
    dependencies: readonly RuntimeNodeId[];
    nodeType: Extract<RuntimeNodeType, "computed" | "async-boundary">;
    classification: ComputedClassification;
    asyncBoundary?: boolean;
}
