
import {
    warn,
    error,
    log,
    isValidData,
    isValidStoreName,
    sanitize,
    parsePath,
    validateDepth,
    getByPath,
    setByPath,
    suggestStoreName,
} from "./utils.js";

const _stores = {};   
const _subscribers = {};  
const _initial = {};   
const _meta = {};  



const _notify = (name) => {
    const subs = _subscribers[name];
    if (!subs || subs.length === 0) return;
    const snapshot = { ..._stores[name] };
    subs.forEach((fn) => fn(snapshot));
};


const _exists = (name) => {
    if (_stores[name] !== undefined) return true;
    suggestStoreName(name, Object.keys(_stores));
    return false;
};
