// A small key-value store that lives on the student's device, used for offline lectures.
//
// IndexedDB is tried first (it can hold a lot), then localStorage (about 5 MB), then plain memory
// (lost when the page closes). Every call is safe: if storage is blocked or full, it falls through to
// the next place and never throws into the lecture.

import { safeLocalStorage, safeIndexedDB } from "../safeStorage.js";

const DB_NAME = "semai-offline";
const STORE_NAME = "kv";

export function memoryBackend() {
  const m = new Map();
  return {
    name: "memory",
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : undefined; },
    async set(k, v) { m.set(k, JSON.stringify(v)); },
    async remove(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
  };
}

export function localStorageBackend(storage = safeLocalStorage(), prefix = "semai_off:") {
  if (!storage) return null;
  return {
    name: "localStorage",
    async get(k) { const raw = storage.getItem(prefix + k); return raw === null ? undefined : JSON.parse(raw); },
    async set(k, v) { storage.setItem(prefix + k, JSON.stringify(v)); }, // throws when full: the store then tries the next place
    async remove(k) { storage.removeItem(prefix + k); },
    async keys() { const out = []; for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key && key.startsWith(prefix)) out.push(key.slice(prefix.length)); } return out; },
  };
}

export function indexedDbBackend(idb = safeIndexedDB()) {
  if (!idb) return null;
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB unavailable"));
        req.onblocked = () => reject(new Error("IndexedDB blocked"));
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  };
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const st = tx.objectStore(STORE_NAME);
      const req = fn(st);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB error"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB aborted"));
    });
  };
  return {
    name: "indexedDB",
    get: (k) => run("readonly", (s) => s.get(k)),
    set: (k, v) => run("readwrite", (s) => s.put(v, k)),
    remove: (k) => run("readwrite", (s) => s.delete(k)),
    keys: () => run("readonly", (s) => s.getAllKeys()),
  };
}

// backends: tried in order. Reads return the first value found; writes go to the first backend that accepts them.
export function createStore(backends) {
  const list = (backends || []).filter(Boolean);
  const safe = async (fn) => { try { return await fn(); } catch (e) { return undefined; } };
  return {
    async get(key) {
      for (const b of list) { const v = await safe(() => b.get(key)); if (v !== undefined) return v; }
      return undefined;
    },
    async set(key, value) {
      for (const b of list) {
        try { await b.set(key, value); return b.name; } catch (e) { /* full or blocked: try the next place */ }
      }
      return null;
    },
    async remove(key) { for (const b of list) await safe(() => b.remove(key)); },
    async keys() {
      const all = new Set();
      for (const b of list) for (const k of (await safe(() => b.keys())) || []) all.add(k);
      return [...all];
    },
  };
}

let shared = null;
export function offlineStore() {
  if (!shared) shared = createStore([indexedDbBackend(), localStorageBackend(), memoryBackend()]);
  return shared;
}
export function _setOfflineStoreForTests(s) { shared = s; }
