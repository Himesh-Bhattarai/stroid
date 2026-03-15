/**
 * @module internals/computed-order
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/computed-order.
 *
 * Consumers: Internal imports and public API.
 */
import { registerTestResetHook } from "./test-reset.js";

export type ComputedOrderResolver = (names: string[]) => string[];

let resolver: ComputedOrderResolver | null = null;

export const setComputedOrderResolver = (next: ComputedOrderResolver | null): void => {
    resolver = next;
};

export const getComputedOrder = (names: string[]): string[] => {
    return resolver ? resolver(names) : [];
};

registerTestResetHook("computed.order-resolver", () => {
    resolver = null;
}, 105);


