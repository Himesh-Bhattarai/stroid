/**
 * @fileoverview src\utils.ts
 */
export {
    __DEV__,
    isDev,
    warn,
    warnAlways,
    error,
    log,
    critical,
    suggestStoreName,
} from "./internals/diagnostics.js";

export { crc32, hashState, checksumState } from "./utils/hash.js";
export { shallowClone, deepClone, shallowEqual, produceClone } from "./utils/clone.js";
export { parsePath, validateDepth, getByPath, setByPath, type PathInput } from "./utils/path.js";
export {
    runSchemaValidation,
    getType,
    isValidData,
    canReuseSanitized,
    sanitize,
    isValidStoreName,
    type SupportedType,
} from "./utils/validation.js";

