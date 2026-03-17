/**
 * @module react/registry
 *
 * LAYER: React hooks
 * OWNS:  Registry scoping for React trees.
 *
 * Consumers: react/hooks-core.ts, public stroid/react entrypoint.
 */
import React, { createContext, useContext, type ReactNode } from "react";
import type { StoreRegistry } from "../store-registry.js";

const RegistryContext = createContext<StoreRegistry | null>(null);

export const RegistryScope = ({
    value,
    children,
}: {
    value: StoreRegistry;
    children?: ReactNode;
}) => (
    React.createElement(RegistryContext.Provider, { value }, children)
);

export const useRegistryContext = (): StoreRegistry | null =>
    useContext(RegistryContext);
