import { getStore, setStore, hasStore } from "./store.js";
import { warn, error, isDev } from "./utils.js";

const _reportMissingStore = (storeName: string, action: "read" | "write"): void => {
    const message =
        action === "write"
            ? `chain("${storeName}") cannot write because the store does not exist yet. Call createStore("${storeName}", data) first.`
            : `chain("${storeName}") cannot read because the store does not exist yet. Call createStore("${storeName}", data) first.`;

    if (isDev()) {
        error(message);
        return;
    }
    if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error(`[stroid] ${message}`);
    }
};

const getStoreAny = getStore as (name: string, path?: string | string[]) => unknown;
const setStoreAny = setStore as (name: string, pathOrData: unknown, value?: unknown) => void;

class StroidChain {
    private _storeName: string;
    private _path: string[];

    constructor(storeName: string, path: string[] = []) {
        this._storeName = storeName;
        this._path = path;
    }

    nested(key: string): StroidChain {
        if (typeof key !== "string" || key.trim() === "") {
            error(`nested() expects a string key. Got: ${JSON.stringify(key)}`);
            return this;
        }
        return new StroidChain(this._storeName, [...this._path, key]);
    }

    target(key: string): TargetNode {
        if (typeof key !== "string" || key.trim() === "") {
            error(`target() expects a string key. Got: ${JSON.stringify(key)}`);
            return new TargetNode(this._storeName, this._path, null);
        }
        return new TargetNode(this._storeName, this._path, key);
    }

    get value(): unknown {
        if (!hasStore(this._storeName)) {
            _reportMissingStore(this._storeName, "read");
            return null;
        }
        if (this._path.length === 0) {
            return getStoreAny(this._storeName);
        }
        return getStoreAny(this._storeName, this._path.join("."));
    }

    set(newValue: unknown): void {
        if (!hasStore(this._storeName)) {
            _reportMissingStore(this._storeName, "write");
            return;
        }
        if (this._path.length === 0) {
            setStoreAny(this._storeName, newValue);
        } else {
            setStoreAny(this._storeName, this._path.join("."), newValue);
        }
    }
}

class TargetNode {
    private _storeName: string;
    private _parentPath: string[];
    private _key: string | null;
    private _fullPath: string;

    constructor(storeName: string, parentPath: string[], key: string | null) {
        this._storeName = storeName;
        this._parentPath = parentPath;
        this._key = key;
        this._fullPath = key
            ? [...parentPath, key].join(".")
            : parentPath.join(".");
    }

    get value(): unknown {
        if (!this._key) {
            warn("target() was called without a key - returning null");
            return null;
        }
        if (!hasStore(this._storeName)) {
            _reportMissingStore(this._storeName, "read");
            return null;
        }
        return getStoreAny(this._storeName, this._fullPath);
    }

    set(newValue: unknown): void {
        if (!this._key) {
            warn("target() was called without a key - cannot set value");
            return;
        }
        if (!hasStore(this._storeName)) {
            _reportMissingStore(this._storeName, "write");
            return;
        }
        setStoreAny(this._storeName, this._fullPath, newValue);
    }
}

export const chain = (storeName: string): StroidChain => {
    if (!hasStore(storeName)) {
        _reportMissingStore(storeName, "read");
    }
    return new StroidChain(storeName);
};
