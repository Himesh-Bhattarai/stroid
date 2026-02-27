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
    deepClone,
    produceClone,
    hashState,
    runSchemaValidation,
} from "./utils.js";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
const _stores = Object.create(null);
const _subscribers = Object.create(null);
const _initial = Object.create(null);
const _meta = Object.create(null);
const _history = Object.create(null);
const _syncChannels = Object.create(null);

const _pendingNotifications = new Set();
let _notifyScheduled = false;
let _batchDepth = 0;
const INSTANCE_ID = `stroid_${Math.random().toString(16).slice(2)}`;

// DevTools (Redux DevTools extension)
let _devtools;

// In-memory fallback storage
const memoryStorage = (() => {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, v); },
        removeItem: (k) => { m.delete(k); },
        type: "memory",
    };
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const _scheduleFlush = () => {
    if (_notifyScheduled) return;
    _notifyScheduled = true;
    const run = () => {
        _notifyScheduled = false;
        _pendingNotifications.forEach((name) => {
            const subs = _subscribers[name];
            if (!subs || subs.length === 0) return;
            const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const snapshot = deepClone(_stores[name]);
            subs.forEach((fn) => fn(snapshot));
            const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const delta = end - start;
            const metrics = _meta[name]?.metrics || { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 };
            metrics.notifyCount += 1;
            metrics.totalNotifyMs += delta;
            metrics.lastNotifyMs = delta;
            if (_meta[name]) _meta[name].metrics = metrics;
        });
        _pendingNotifications.clear();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(run);
    else Promise.resolve().then(run);
};

const _notify = (name) => {
    _pendingNotifications.add(name);
    if (_batchDepth === 0) _scheduleFlush();
};

const _exists = (name) => {
    if (_stores[name] !== undefined) return true;
    suggestStoreName(name, Object.keys(_stores));
    return false;
};

const _safeStorage = (type) => {
    try {
        if (typeof window === "undefined") return memoryStorage;
        if (type === "session" || type === "sessionStorage") return window.sessionStorage ?? memoryStorage;
        return window.localStorage ?? memoryStorage;
    } catch (_) {
        return memoryStorage;
    }
};

const _normalizePersist = (persist, name) => {
    if (!persist) return null;

    if (persist === true) {
        return {
            driver: _safeStorage("localStorage"),
            key: `stroid_${name}`,
            serialize: JSON.stringify,
            deserialize: JSON.parse,
            encrypt: (v) => v,
            decrypt: (v) => v,
        };
    }

    if (typeof persist === "string") {
        return {
            driver: _safeStorage(persist),
            key: `stroid_${name}`,
            serialize: JSON.stringify,
            deserialize: JSON.parse,
            encrypt: (v) => v,
            decrypt: (v) => v,
        };
    }

    if (typeof persist === "object") {
        return {
            driver: persist.storage || persist.driver || _safeStorage("localStorage"),
            key: persist.key || `stroid_${name}`,
            serialize: persist.serialize || JSON.stringify,
            deserialize: persist.deserialize || JSON.parse,
            encrypt: persist.encrypt || ((v) => v),
            decrypt: persist.decrypt || ((v) => v),
        };
    }

    return null;
};

const _devtoolsInit = (name) => {
    const useDevtools = _meta[name]?.options?.devtools;
    if (!useDevtools) return;
    if (typeof window === "undefined") return;
    const ext = window.__REDUX_DEVTOOLS_EXTENSION__ || window.__REDUX_DEVTOOLS_EXTENSION__;
    if (!ext || typeof ext.connect !== "function") {
        warn(`DevTools requested for "${name}" but Redux DevTools extension not found.`);
        return;
    }
    if (!_devtools) {
        _devtools = ext.connect({ name: "stroid" });
        _devtools.init(_stores);
    }
};

const _devtoolsSend = (name, action, force = false) => {
    if (!_devtools || (!force && !_meta[name]?.options?.devtools)) return;
    try {
        const state = { ..._stores, [name]: _applyRedactor(name, _stores[name]) };
        _devtools.send({ type: `${name}/${action}` }, state);
    } catch (_) { /* ignore */ }
};

const _runMiddleware = (name, payload) => {
    const middlewares = _meta[name]?.options?.middleware || [];
    if (!Array.isArray(middlewares)) return payload.next;

    let nextState = payload.next;
    for (const mw of middlewares) {
        if (typeof mw !== "function") continue;
        const result = mw({
            action: payload.action,
            name,
            prev: payload.prev,
            next: nextState,
            path: payload.path,
        });
        if (result !== undefined) nextState = result;
    }
    return nextState;
};

const _applyRedactor = (name, data) => {
    const redactor = _meta[name]?.options?.redactor;
    if (typeof redactor === "function") {
        try { return redactor(deepClone(data)); }
        catch (_) { return data; }
    }
    return data;
};

const _diffShallow = (prev, next) => {
    if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null) return null;
    const added = [];
    const removed = [];
    const changed = [];
    const prevKeys = new Set(Object.keys(prev));
    const nextKeys = new Set(Object.keys(next));
    nextKeys.forEach((k) => {
        if (!prevKeys.has(k)) added.push(k);
        else if (!Object.is(prev[k], next[k])) changed.push(k);
    });
    prevKeys.forEach((k) => {
        if (!nextKeys.has(k)) removed.push(k);
    });
    return { added, removed, changed };
};

const _pushHistory = (name, action, prev, next) => {
    const limit = _meta[name]?.options?.historyLimit ?? 50;
    if (limit === 0) return;
    if (!_history[name]) _history[name] = [];
    const entry = {
        ts: Date.now(),
        action,
        prev: _applyRedactor(name, prev),
        next: _applyRedactor(name, next),
        diff: _diffShallow(prev, next),
    };
    _history[name].push(entry);
    if (_history[name].length > limit) {
        _history[name].splice(0, _history[name].length - limit);
    }
};

const _validateSchema = (name, next) => {
    const schema = _meta[name]?.options?.schema;
    if (!schema) return { ok: true };
    const res = runSchemaValidation(schema, next);
    if (!res.ok) {
        const msg = `Schema validation failed for "${name}": ${res.error}`;
        _meta[name]?.options?.onError?.(msg);
        warn(msg);
    }
    return res;
};

const _persistSave = (name) => {
    const cfg = _meta[name]?.options?.persist;
    if (!cfg) return;
    try {
        const serialized = cfg.serialize(_stores[name]);
        const checksum = hashState(serialized);
        const envelope = JSON.stringify({
            v: _meta[name]?.version ?? 1,
            checksum,
            data: serialized,
        });
        const payload = cfg.encrypt(envelope);
        const setter = cfg.driver?.setItem || cfg.driver?.set;
        if (typeof setter === "function") {
            setter.call(cfg.driver, cfg.key, payload);
        } else {
            cfg.driver[cfg.key] = payload;
        }
    } catch (e) {
        warn(`Could not persist store "${name}" (${e?.message || e})`);
    }
};

const _persistLoad = (name, { silent } = {}) => {
    const cfg = _meta[name]?.options?.persist;
    if (!cfg) return;
    try {
        const getter = cfg.driver?.getItem || cfg.driver?.get;
        const raw = typeof getter === "function"
            ? getter.call(cfg.driver, cfg.key)
            : cfg.driver[cfg.key];
        if (!raw) return;
        const decrypted = cfg.decrypt(raw);
        const envelope = JSON.parse(decrypted);
        const { v = 1, checksum, data } = envelope || {};
        if (!data) return;
        if (checksum !== hashState(data)) {
            warn(`Checksum mismatch loading store "${name}". Falling back to initial state.`);
            _stores[name] = deepClone(_initial[name]);
            return;
        }
        let parsed = cfg.deserialize(data);

        // run migrations if needed
        const targetVersion = _meta[name]?.version ?? 1;
        if (v !== targetVersion) {
            const migrations = _meta[name]?.options?.migrations || {};
            const steps = Object.keys(migrations)
                .map((k) => Number(k))
                .filter((ver) => ver > v && ver <= targetVersion)
                .sort((a, b) => a - b);
            steps.forEach((ver) => {
                try {
                    const migrated = migrations[ver](parsed);
                    if (migrated !== undefined) parsed = migrated;
                } catch (e) {
                    warn(`Migration to v${ver} failed for "${name}": ${e?.message || e}`);
                }
            });
        }

        const schemaResult = _validateSchema(name, parsed);
        if (!schemaResult.ok) {
            warn(`Persisted state for "${name}" failed schema; resetting to initial.`);
            _stores[name] = deepClone(_initial[name]);
            return;
        }

        _stores[name] = parsed;
        if (!silent) log(`Store "${name}" loaded from persistence`);
    } catch (e) {
        warn(`Could not load store "${name}" (${e?.message || e})`);
    }
};

const _setupSync = (name) => {
    const sync = _meta[name]?.options?.sync;
    if (!sync) return;
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
        warn(`Sync enabled for "${name}" but BroadcastChannel not available in this environment.`);
        return;
    }
    const channelName = typeof sync === "object" && sync.channel
        ? sync.channel
        : `stroid_sync_${name}`;

    try {
        const channel = new BroadcastChannel(channelName);
        _syncChannels[name] = channel;
        channel.onmessage = (event) => {
            const msg = event.data;
            if (!msg || msg.source === INSTANCE_ID) return;
            if (msg.name !== name) return;
            const localUpdated = new Date(_meta[name]?.updatedAt || 0).getTime();
            const incomingUpdated = msg.updatedAt;
            const resolver = typeof sync === "object" ? sync.conflictResolver : null;

            // resolve conflict
            if (incomingUpdated <= localUpdated) {
                if (resolver) {
                    const resolved = resolver({
                        local: _stores[name],
                        incoming: msg.data,
                        localUpdated,
                        incomingUpdated,
                    });
                    if (resolved !== undefined) {
                        const schemaRes = _validateSchema(name, resolved);
                        if (!schemaRes.ok) return;
                        _stores[name] = resolved;
                        _meta[name].updatedAt = new Date(Math.max(localUpdated, incomingUpdated)).toISOString();
                        _meta[name].updateCount++;
                        _notify(name);
                    }
                }
                return;
            }

            const schemaRes = _validateSchema(name, msg.data);
            if (!schemaRes.ok) return;
            _stores[name] = msg.data;
            _meta[name].updatedAt = new Date(incomingUpdated).toISOString();
            _meta[name].updateCount++;
            _notify(name);
        };
    } catch (e) {
        warn(`Failed to setup sync for "${name}": ${e?.message || e}`);
    }
};

const _broadcastSync = (name) => {
    const channel = _syncChannels[name];
    if (!channel) return;
    try {
        channel.postMessage({
            source: INSTANCE_ID,
            name,
            updatedAt: Date.parse(_meta[name]?.updatedAt || new Date().toISOString()),
            data: _applyRedactor(name, _stores[name]),
            checksum: hashState(_stores[name]),
        });
    } catch (_) { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const createStore = (name, initialData, option = {}) => {
    if (!isValidStoreName(name)) return;
    if (!isValidData(initialData)) return;

    if (_stores[name] !== undefined) {
        warn(
            `Store "${name}" already exists and will be overwritten.\n` +
            `Use setStore("${name}", data) to update instead.`
        );
    }

    const {
        persist = false,
        devtools = false,
        middleware = [],
        onSet,
        onReset,
        onDelete,
        onCreate,
        onError,
        validator,
        schema,
        migrations = {},
        version = 1,
        redactor,
        historyLimit = 50,
        sync,
    } = option;

    const persistConfig = _normalizePersist(persist, name);
    const clean = sanitize(initialData);

    const schemaCheck = _validateSchema(name, clean);
    if (!schemaCheck.ok) return;

    _stores[name] = clean;
    _subscribers[name] = _subscribers[name] || [];
    _initial[name] = deepClone(clean);
    _meta[name] = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updateCount: 0,
        version,
        metrics: { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
        options: {
            persist: persistConfig,
            devtools,
            middleware,
            onSet,
            onReset,
            onDelete,
            onCreate,
            onError,
            validator,
            schema,
            migrations,
            redactor,
            historyLimit,
            sync,
        },
    };

    if (persistConfig) {
        _persistSave(name);
        _persistLoad(name, { silent: true });
    }

    _meta[name].options?.onCreate?.(clean);
    _devtoolsInit(name);
    _setupSync(name);
    _pushHistory(name, "create", null, clean);

    log(`Store "${name}" created -> ${JSON.stringify(clean)}`);
    return clean;
};

export const setStore = (name, keyOrData, value) => {
    if (!_exists(name)) return;

    let updated;
    const prev = _stores[name];

    if (typeof keyOrData === "function" && value === undefined) {
        updated = produceClone(prev, keyOrData);
    }

    else if (typeof keyOrData === "object" && !Array.isArray(keyOrData) && value === undefined) {
        if (!isValidData(keyOrData)) return;
        updated = { ...prev, ...sanitize(keyOrData) };
    }

    else if (typeof keyOrData === "string" || Array.isArray(keyOrData)) {
        if (!validateDepth(keyOrData)) return;
        updated = setByPath(prev, keyOrData, sanitize(value));
    }

    else {
        error(
            `setStore("${name}") - invalid arguments.\n` +
            `Usage:\n` +
            `  setStore("${name}", "field", value)\n` +
            `  setStore("${name}", "nested.field", value)\n` +
            `  setStore("${name}", { field: value })`
        );
        return;
    }

    if (!isValidData(updated)) return;

    const validator = _meta[name]?.options?.validator;
    if (validator && validator(updated) === false) {
        _meta[name]?.options?.onError?.(`Validator blocked update for "${name}"`);
        return;
    }

    const next = _runMiddleware(name, { action: "set", prev, next: sanitize(updated), path: keyOrData });

    const schemaRes = _validateSchema(name, next);
    if (!schemaRes.ok) return;

    _stores[name] = next;
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;

    if (_meta[name].options?.persist) _persistSave(name);

    _meta[name].options?.onSet?.(prev, next);
    _pushHistory(name, "set", prev, next);
    _devtoolsSend(name, "set");
    _notify(name);
    _broadcastSync(name);

    log(`Store "${name}" updated`);
};

export const setStoreBatch = (fn) => {
    _batchDepth++;
    try {
        fn();
    } finally {
        _batchDepth = Math.max(0, _batchDepth - 1);
        if (_batchDepth === 0 && _pendingNotifications.size > 0) {
            _scheduleFlush();
        }
    }
};

export const getStore = (name, path) =>{
    if(!_exists(name)) return null;
    const data = _stores[name];

    if(path === undefined){
        return Array.isArray(data) ? [...data] : { ...data };
    }

    if(!validateDepth(path)) return null;
    return getByPath(data, path);
};

export const deleteStore = (name) =>{
    if(!_exists(name)) return;

    const subs = _subscribers[name];
    subs?.forEach((fn) => fn(null));

    _meta[name]?.options?.onDelete?.(_stores[name]);
    const cfg = _meta[name]?.options?.persist;
    const devtoolsEnabled = _meta[name]?.options?.devtools;

    delete _stores[name];
    delete _subscribers[name];
    delete _initial[name];
    delete _meta[name];

    try{
        if (cfg?.driver?.removeItem) cfg.driver.removeItem(cfg.key);
    }catch (_) {}

    if (devtoolsEnabled) _devtoolsSend(name, "delete", true);
    log(`Store "${name}" deleted`);
};

export const resetStore = (name) =>{
    if(!_exists(name)) return;
    if(!_initial[name]) return;

    const prev = _stores[name];
    const resetValue = deepClone(_initial[name]);

    _stores[name] = resetValue;
    _meta[name].updatedAt = new Date().toISOString();

    _meta[name].options?.onReset?.(prev, resetValue);
    _pushHistory(name, "reset", prev, resetValue);
    _devtoolsSend(name, "reset");
    _notify(name);
    _broadcastSync(name);
    log(`Store "${name}" reset to initial state/value`);
};

export const mergeStore = (name, data)=>{
    if(!_exists(name)) return;
    if(!isValidData(data)) return;

    const current = _stores[name];

    if(typeof current !== "object" || Array.isArray(current)){
        error(
            `mergeStore("${name}") only works on object stores.\n`+
            `Use setStore("${name}", value) instead.`
        );
        return;
    }

    const next = { ...current, ...sanitize(data) };
    const final = _runMiddleware(name, { action: "merge", prev: current, next, path: null });

    const schemaRes = _validateSchema(name, final);
    if (!schemaRes.ok) return;

    _stores[name] = final;
    _meta[name].updatedAt = new Date().toISOString();
    _meta[name].updateCount++;

    if (_meta[name].options?.persist) _persistSave(name);

    _meta[name].options?.onSet?.(current, final);
    _pushHistory(name, "merge", current, final);
    _devtoolsSend(name, "merge");
    _notify(name);
    _broadcastSync(name);
    log(`Store "${name}" merged with data`);
};

export const clearAllStores = ()=>{
    const names = Object.keys(_stores);
    names.forEach(deleteStore);
    warn(`All stores cleared (${names.length} stores removed)`);
};

export const hasStore = (name) =>{
    return _stores[name] !== undefined;
};

export const listStores = ()=>{
    return Object.keys(_stores);
};

export const getStoreMeta = (name) =>{
    if(!_exists(name)) return null;
    return { ..._meta[name] };
};

export const _subscribe = (name, fn)=>{
    if(!_subscribers[name]) _subscribers[name] = [];
    _subscribers[name].push(fn);
    
    return () =>{
        _subscribers[name] = _subscribers[name].filter((s) => s !== fn);
    };
};

export const subscribeWithSelector = (name, selector, equality = Object.is, listener) => {
    if (typeof selector !== "function" || typeof listener !== "function") {
        warn(`subscribeWithSelector("${name}") requires selector and listener functions.`);
        return () => {};
    }
    let prevSel;
    try { prevSel = selector(_stores[name]); }
    catch (_) { prevSel = undefined; }
    const wrapped = (state) => {
        let nextSel;
        try { nextSel = selector(state); }
        catch (_) { nextSel = undefined; }
        if (!equality(nextSel, prevSel)) {
            const last = prevSel;
            prevSel = nextSel;
            listener(nextSel, last);
        }
    };
    return _subscribe(name, wrapped);
};

export const _getSnapshot = (name) =>{
    return _stores[name]??null;
};

// ---------------------------------------------------------------------------
// Selectors & presets
// ---------------------------------------------------------------------------
export const createSelector = (storeName, selectorFn) => {
    let lastRef;
    let lastResult;
    return () => {
        const state = _stores[storeName];
        if (state === undefined) return null;
        if (state === lastRef) return lastResult;
        lastRef = state;
        lastResult = selectorFn(state);
        return lastResult;
    };
};

export const createCounterStore = (name, initial = 0, options = {}) => {
    createStore(name, { value: initial }, options);
    return {
        inc: (n = 1) => setStore(name, (draft) => { draft.value += n; }),
        dec: (n = 1) => setStore(name, (draft) => { draft.value -= n; }),
        set: (v) => setStore(name, "value", v),
        reset: () => resetStore(name),
        get: () => getStore(name, "value"),
    };
};

export const createListStore = (name, initial = [], options = {}) => {
    createStore(name, { items: initial }, options);
    return {
        push: (item) => setStore(name, (draft) => { draft.items.push(item); }),
        removeAt: (index) => setStore(name, (draft) => { draft.items.splice(index, 1); }),
        clear: () => setStore(name, { items: [] }),
        replace: (items) => setStore(name, { items }),
        all: () => getStore(name, "items"),
    };
};

export const createEntityStore = (name, options = {}) => {
    createStore(name, { entities: {}, ids: [] }, options);
    return {
        upsert: (entity) => setStore(name, (draft) => {
            const id = entity.id
                ?? entity._id
                ?? ((typeof crypto !== "undefined" && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
            if (!draft.ids.includes(id)) draft.ids.push(id);
            draft.entities[id] = entity;
        }),
        remove: (id) => setStore(name, (draft) => {
            draft.ids = draft.ids.filter((i) => i !== id);
            delete draft.entities[id];
        }),
        all: () => {
            const store = _stores[name];
            if (!store) return [];
            return store.ids.map((id) => store.entities[id]);
        },
        get: (id) => getStore(name, `entities.${id}`),
        clear: () => resetStore(name),
    };
};

export const getInitialState = () => deepClone(_stores);

export const getHistory = (name, limit) => {
    if (!_history[name]) return [];
    const entries = _history[name];
    if (limit && limit > 0) return entries.slice(-limit);
    return [...entries];
};

export const clearHistory = (name) => {
    if (name) {
        delete _history[name];
    } else {
        Object.keys(_history).forEach((n) => delete _history[n]);
    }
};

export const getMetrics = (name) => {
    const meta = _meta[name];
    if (!meta?.metrics) return null;
    return { ...meta.metrics };
};

export const createStoreForRequest = (initializer) => {
    const buffer = {};
    const api = {
        create: (name, data, options = {}) => {
            buffer[name] = deepClone(data);
            return buffer[name];
        },
        set: (name, updater) => {
            if (!buffer[name]) return;
            buffer[name] = typeof updater === "function" ? produceClone(buffer[name], updater) : updater;
            return buffer[name];
        },
        get: (name) => deepClone(buffer[name]),
    };
    if (typeof initializer === "function") initializer(api);
    return {
        snapshot: () => deepClone(buffer),
        hydrate: (options = {}) => hydrateStores(buffer, options),
    };
};

export const hydrateStores = (snapshot, options = {}) => {
    if (!snapshot || typeof snapshot !== "object") return;
    Object.entries(snapshot).forEach(([name, data]) => {
        if (hasStore(name)) {
            setStore(name, data);
        } else {
            createStore(name, data, options[name] || options.default || {});
        }
    });
};

// ---------------------------------------------------------------------------
// Zustand compatibility shim
// ---------------------------------------------------------------------------
export const createZustandCompatStore = (initializer, options = {}) => {
    const name = options.name || `zstore_${Date.now()}`;

    const setState = (partial, replace = false) => {
        const current = _stores[name] ?? {};
        const nextPartial = typeof partial === "function" ? partial(current) : partial;
        const next = replace ? nextPartial : { ...current, ...nextPartial };
        setStore(name, next);
    };

    const getState = () => _stores[name];
    const api = {
        setState,
        getState,
        subscribe: (listener) => _subscribe(name, listener),
        subscribeWithSelector: (selector, equality = Object.is, listener) =>
            subscribeWithSelector(name, selector, equality, (next, prev) => listener(next, prev)),
        destroy: () => deleteStore(name),
    };

    const initial = initializer(setState, getState, api);
    createStore(name, initial, options);

    return api;
};
