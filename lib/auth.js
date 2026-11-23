'use strict';
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LEN = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// 会话在存储中只保存令牌的哈希，泄露数据文件也无法直接冒用会话
function tokenId(token) {
  return crypto.createHash('sha256').update(String(token)).digest('base64url');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

// 简单的登录失败限流：同一 IP 15 分钟内最多 10 次失败
class RateLimiter {
  constructor(limit = 10, windowMs = 15 * 60 * 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.map = new Map();
  }

  blocked(key) {
    const e = this.map.get(key);
    if (!e) return false;
    if (Date.now() > e.reset) {
      this.map.delete(key);
      return false;
    }
    return e.count >= this.limit;
  }

  fail(key) {
    const now = Date.now();
    const e = this.map.get(key);
    if (!e || now > e.reset) this.map.set(key, { count: 1, reset: now + this.windowMs });
    else e.count += 1;
  }

  clear(key) {
    this.map.delete(key);
  }
}

function validateUsername(name) {
  if (typeof name !== 'string') return '请输入用户名';
  const n = name.trim();
  if (n.length < 2 || n.length > 32) return '用户名长度需为 2–32 个字符';
  if (!/^[\p{L}\p{N}_.-]+$/u.test(n)) return '用户名只能包含字母、数字、下划线、点和短横线';
  return null;
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 6) return '密码至少 6 位';
  if (pw.length > 128) return '密码过长';
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  newToken,
  tokenId,
  parseCookies,
  RateLimiter,
  validateUsername,
  validatePassword,
};
