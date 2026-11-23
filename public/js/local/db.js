// IndexedDB 封装：启动时把当前账号的数据读入内存，修改时写回

const DB_NAME = 'rty-code';
const STORES = ['projects', 'tasks', 'accounts'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('无法打开浏览器本地数据库（可能处于无痕模式或已禁用存储）'));
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const result = fn(s);
        t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
        t.onerror = () => reject(t.error || new Error('本地数据库写入失败'));
        t.onabort = () => reject(t.error || new Error('本地数据库写入失败（存储空间可能不足）'));
      }),
  );
}

export const idb = {
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  put: (store, obj) => tx(store, 'readwrite', (s) => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
};

/** 内存中的集合，写入时异步持久化 */
export class Collection {
  constructor(store) {
    this.store = store;
    this.items = new Map();
    this.onError = null;
  }

  async load(filter) {
    this.items.clear();
    for (const o of await idb.getAll(this.store)) if (!filter || filter(o)) this.items.set(o.id, o);
  }

  get(id) {
    return this.items.get(id) || null;
  }

  all() {
    return [...this.items.values()];
  }

  filter(fn) {
    return this.all().filter(fn);
  }

  save(obj) {
    this.items.set(obj.id, obj);
    // structuredClone 避免后续修改与写入并发
    idb.put(this.store, structuredClone(obj)).catch((e) => this.onError && this.onError(e));
    return obj;
  }

  remove(id) {
    this.items.delete(id);
    idb.del(this.store, id).catch((e) => this.onError && this.onError(e));
  }
}

export function newId() {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
}

export async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) {
    // 非 HTTPS 环境没有 WebCrypto，退化为简单哈希（仅用于区分本地账号）
    let h1 = 0x811c9dc5;
    let h2 = 0x1b873593;
    for (let i = 0; i < text.length; i++) {
      h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619);
      h2 = Math.imul(h2 ^ text.charCodeAt(i), 2246822507);
    }
    return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).repeat(4);
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
