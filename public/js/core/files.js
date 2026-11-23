// 项目虚拟文件系统的公共工具（浏览器与 Node 通用）

const enc = new TextEncoder();
const byteLength = (s) => enc.encode(s).length;

export const LIMITS = {
  maxFileBytes: 1024 * 1024, // 单文件 1MB
  maxFiles: 500,
  maxProjectBytes: 20 * 1024 * 1024, // 单项目 20MB
};

export function normPath(p) {
  if (typeof p !== 'string') throw new Error('path 必须是字符串');
  const s = p.replace(/\\/g, '/').trim();
  const parts = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') throw new Error('路径中不能包含 ..');
    if (/[\0<>:"|?*]/.test(seg)) throw new Error(`路径包含非法字符：${seg}`);
    parts.push(seg);
  }
  if (!parts.length) throw new Error('路径不能为空');
  const out = parts.join('/');
  if (out.length > 300) throw new Error('路径过长');
  return out;
}

export function projectBytes(files) {
  let n = 0;
  for (const v of Object.values(files)) n += byteLength(v);
  return n;
}

// 写入前校验大小与数量限制；返回规范化后的路径
export function checkWrite(files, path, content) {
  if (typeof content !== 'string') throw new Error('content 必须是字符串');
  const p = normPath(path);
  const size = byteLength(content);
  if (size > LIMITS.maxFileBytes) throw new Error(`文件超过 ${LIMITS.maxFileBytes / 1024}KB 的大小限制`);
  if (!(p in files) && Object.keys(files).length >= LIMITS.maxFiles) {
    throw new Error(`项目文件数量已达上限 ${LIMITS.maxFiles}`);
  }
  // 父路径不能是文件，也不能把文件写到已存在的目录路径上
  const segs = p.split('/');
  for (let i = 1; i < segs.length; i++) {
    const parent = segs.slice(0, i).join('/');
    if (parent in files) throw new Error(`"${parent}" 是文件，不能作为目录`);
  }
  const prefix = p + '/';
  if (Object.keys(files).some((k) => k.startsWith(prefix))) throw new Error(`"${p}" 是目录，不能写成文件`);
  const old = p in files ? byteLength(files[p]) : 0;
  if (projectBytes(files) - old + size > LIMITS.maxProjectBytes) {
    throw new Error(`项目总大小超过 ${LIMITS.maxProjectBytes / 1024 / 1024}MB 的限制`);
  }
  return p;
}

export function sortedPaths(files) {
  return Object.keys(files).sort((a, b) => a.localeCompare(b));
}
