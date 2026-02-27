
import { getStore, setStore, hasStore } from "./store.js";
import { warn, error } from "./utils.js";


class StroidChain {
    constructor(storeName, path = []) {
        this._storeName = storeName; 
        this._path = path;     
    }


    nested(key) {
        if (typeof key !== "string" || key.trim() === "") {
            error(`nested() expects a string key. Got: ${JSON.stringify(key)}`);
            return this;
        }

        return new StroidChain(
            this._storeName,
            [...this._path, key]
        );
    }

    target(key) {
        if (typeof key !== "string" || key.trim() === "") {
            error(`target() expects a string key. Got: ${JSON.stringify(key)}`);
            return new TargetNode(this._storeName, this._path, null);
        }

        return new TargetNode(
            this._storeName,
            this._path,
            key
        );
    }

    get value() {
        if (this._path.length === 0) {
            return getStore(this._storeName);
        }
        return getStore(this._storeName, this._path.join("."));
    }

    set(newValue) {
        if (this._path.length === 0) {
            setStore(this._storeName, newValue);
        } else {
            setStore(this._storeName, this._path.join("."), newValue);
        }
    }
}



class TargetNode {
    constructor(storeName, parentPath, key) {
        this._storeName = storeName;
        this._parentPath = parentPath; 
        this._key = key;       
        this._fullPath = key
            ? [...parentPath, key].join(".")
            : parentPath.join(".");
    }

    get value() {
        if (!this._key) {
            warn("target() was called without a key - returning null");
            return null;
        }
        return getStore(this._storeName, this._fullPath);
    }

    set(newValue) {
        if (!this._key) {
            warn("target() was called without a key - cannot set value");
            return;
        }
        setStore(this._storeName, this._fullPath, newValue);
    }
}


export const chain = (storeName) => {
    if (!hasStore(storeName)) {
        // Trigger the suggestion logic from utils via a dummy check or direct call if possible
        // Since _exists is internal to store.js, we rely on the fact that getStore/setStore 
        // will call _exists and log the error/suggestion anyway.
        warn(`chain("${storeName}") called before store exists; operations will no-op until created.`);
    }
    return new StroidChain(storeName);
};
