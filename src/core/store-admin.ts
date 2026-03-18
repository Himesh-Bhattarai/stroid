/**
 * @module store-admin
 *
 * LAYER: Store runtime
 * OWNS:  Public delete/reset/clear exports.
 *
 * Consumers: store-write barrel.
 */
export {
    deleteStore,
    resetStore,
    clearAllStores,
    _hardResetAllStoresForTest,
} from "./store-admin-impl.js";
