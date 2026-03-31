/**
 * @module runtime-tools/graph
 *
 * LAYER: Module
 * OWNS:  Computed graph inspection helpers.
 *
 * Consumers: runtime-tools index and public API.
 */
import {
    getFullComputedGraph,
    getComputedDepsFor,
    getComputedDescriptor as getComputedDescriptorById,
    getRuntimeComputedGraph,
    evaluateComputedFromSnapshot,
} from "../computed/computed-graph.js";
import type {
    ComputedDescriptor,
    RuntimeGraph,
    RuntimeNodeId,
} from "../computed/types.js";

export const getComputedGraph = () => getFullComputedGraph();

export const getRuntimeGraph = (): RuntimeGraph => getRuntimeComputedGraph();

export const getComputedDeps = (name: string) => getComputedDepsFor(name);

export const getComputedDescriptor = (nodeId: RuntimeNodeId): ComputedDescriptor | null =>
    getComputedDescriptorById(nodeId);

export const evaluateComputed = (
    nodeId: RuntimeNodeId,
    snapshot: Record<string, unknown>
): unknown => evaluateComputedFromSnapshot(nodeId, snapshot);

export type {
    ComputedClassification,
    ComputedDescriptor,
    RuntimeEdgeType,
    RuntimeGraph,
    RuntimeGraphEdge,
    RuntimeGraphGranularity,
    RuntimeGraphNode,
    RuntimeNodeId,
    RuntimeNodeType,
} from "../computed/types.js";
