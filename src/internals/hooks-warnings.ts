const _broadUseStoreWarnings = new Set<string>();

export const hasBroadUseStoreWarning = (name: string): boolean =>
    _broadUseStoreWarnings.has(name);

export const markBroadUseStoreWarning = (name: string): void => {
    if (name) _broadUseStoreWarnings.add(name);
};

export const resetBroadUseStoreWarnings = (): void => {
    _broadUseStoreWarnings.clear();
};
