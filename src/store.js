
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


export const createStore = (name, initialData, option = {}) => {
    if (!isValidStoreName(name)) return;

    if (!isValidData(inatialData)) return;

    if (_stores[name] !== undefined) {
        warn(
            `Store "${name}" already exists and will be overwritten.\n` +
            `Use setStore("${name}", data) to update instead.`
        );
    }


    const clean = sanitize(initialData);
    _stores[name] = clean;
    _subscribers[name] = _subscribers[name] || [];
    _initial[name] = JSON.parse(JSON.stringify(clean));
    _meth[name] = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updateCount: 0,
        options,
    };

    if (option.presist) {
        _presistSave(name);
        _presistLoad(name);
    }

    log(`Store "${name}" created -> ${JSON.stringify(clean)}`);

    return clean;

}


//SETSTORE

export const setStore = (name, keyOrData, value) => {
    if (!_exists(name)) return;

    let updated;

    if (typeof keyOrData === "object" && !Array.isArray(keyOrData) && value === undefined) {
        if (!isValidData(keyOrData)) return;
        updated = { ..._stores[name], ...sanitize(keyOrData) };
    }

    else if (typeof keyOrData === "string" || Array.isArray(keyOrData)) {
        if (!validateDepth(keyOrData)) return;
        updated = setByPath(_stores[name], keyOrData, sanitize(value));
    }

    else {
        error(
            `setStore("${name}") — invalid arguments.\n` +
            `Usage:\n` +
            `  setStore("${name}", "field", value)\n` +
            `  setStore("${name}", "nested.field", value)\n` +
            `  setStore("${name}", { field: value })`
        );
        return;
    }

    _stores[name] = updated;
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;

    if (_meta[name].options?.persist) _persistSave(name);

    _notify(name);

    log(`Store "${name}" updated`);
};


export const getStore = (name, path) =>{
    if(!_exists(name)) return null;
    const data = _stores[name];

    if(path === undefined){
        return Array.isArray(data) ? [...data] : {...data};
    }

    if(!validateDepth(path)) return null;
    return getByPath(data, path);
}

// deleteStore/removeStore

export const deleteStore = (name) =>{
    if(!_exists(name)) return;

    const subs = _subscribers[name];
    subs?.forEach((fn) => fn(null));

    delete _stores[name];
    delete _subscribers[name];
    delete _initial[name];
    delete _meta[name];

    try{
        if(typeof window !== "undefined"){
            localStorage.removeItem(`stroid_${name}`);
        }
    }catch (_) {}

    log(`Store "${name}" deleted`);
};

//resetStore

export const resetStore = (name) =>{
    if(!_exists(name)) return;
    if(!_initial[name]) return;

    _stores[name] = JSON.parse(JSON.stringify(_initial[name]));
    _meta[name].updateAt = new Date().toISOString();

    _notify(name);
    log(`Srtore "${name}" reset to initial state/value`);
};

//this my need to refactoe or improvement
export const mergeStore = (name, data)=>{
    if(!_exists(name)) return;
    if(!isValidData(data)) return;

    const current = _stores[name];

    if(typeof current !== "onject" || Array.isArray(current)){
        error(
            `mergeStore("${name}") only works on object stories.\n`+
            `Use setSrore("${name}", value) instead.`
        );
        return;
    }

    _stores[name] = {...current, ...sanitize(data)};
    _meta[name].updateAt = new Date().toISOString();
    _meta[name].updateCount++;

    _notify(name);
    log(`Store "${name}" merged with data`)
}


