import { getStore, setStore, hasStore } from "./store.js";
import { warn, error } from "./utils.js";

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
        if (this._path.length === 0) {
            return getStore(this._storeName);
        }
        return getStore(this._storeName, this._path.join("."));
    }

    set(newValue: unknown): void {
        if (this._path.length === 0) {
            setStore(this._storeName, newValue as any);
        } else {
            setStore(this._storeName, this._path.join("."), newValue);
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
        return getStore(this._storeName, this._fullPath);
    }

    set(newValue: unknown): void {
        if (!this._key) {
            warn("target() was called without a key - cannot set value");
            return;
        }
        setStore(this._storeName, this._fullPath, newValue);
    }
}

export const chain = (storeName: string): StroidChain => {
    if (!hasStore(storeName)) {
        warn(`chain("${storeName}") called before store exists; operations will no-op until created.`);
    }
    return new StroidChain(storeName);
};
