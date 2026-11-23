'use strict';
// 基于 JSON 文件的轻量存储：每条记录一个文件，启动时全部加载进内存。
// 适合个人站点规模的数据量，无需安装数据库。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function newId(bytes = 9) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function fileNameFor(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('非法的记录 ID');
  return `${id}.json`;
}

class Collection {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.items = new Map();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (obj && obj.id) this.items.set(obj.id, obj);
      } catch (e) {
        console.warn(`[store] 无法读取 ${path.join(dir, f)}: ${e.message}`);
      }
    }
  }

  get(id) {
    return this.items.get(id) || null;
  }

  all() {
    return [...this.items.values()];
  }

  find(fn) {
    for (const v of this.items.values()) if (fn(v)) return v;
    return null;
  }

  filter(fn) {
    return this.all().filter(fn);
  }

  save(obj) {
    this.items.set(obj.id, obj);
    writeJson(path.join(this.dir, fileNameFor(obj.id)), obj);
    return obj;
  }

  remove(id) {
    this.items.delete(id);
    try {
      fs.unlinkSync(path.join(this.dir, fileNameFor(id)));
    } catch {
      /* 文件可能不存在 */
    }
  }
}

class Doc {
  constructor(file, defaults) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* 首次启动 */
    }
    this.data = { ...defaults, ...data };
  }

  get() {
    return this.data;
  }

  update(patch) {
    this.data = { ...this.data, ...patch };
    writeJson(this.file, this.data);
    return this.data;
  }
}

function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  return {
    users: new Collection(path.join(dataDir, 'users')),
    sessions: new Collection(path.join(dataDir, 'sessions')),
    projects: new Collection(path.join(dataDir, 'projects')),
    tasks: new Collection(path.join(dataDir, 'tasks')),
    settings: new Doc(path.join(dataDir, 'settings.json'), {}),
  };
}

module.exports = { createStore, newId };
