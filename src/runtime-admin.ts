import { createStoreAdmin } from "./internals/store-admin.js";

export const { clearAllStores } = createStoreAdmin(new URL("./store.js", import.meta.url).href);
