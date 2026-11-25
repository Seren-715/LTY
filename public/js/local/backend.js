// 纯静态模式的「后端」：在浏览器中实现与 server.js 相同的接口。
// 账号 = API Key，各自的额度由模型平台管理。
// 项目和任务保存在浏览器 IndexedDB 中，智能体直接在页面里运行。
import { Collection, idb, newId, sha256Hex } from './db.js';
import { runAgent, buildUserMessage, titleFromMessage } from '../core/agent.js';
import { getKeyInfo, getTangguoUsage, listModels } from '../core/llm.js';
import { diffStats } from '../core/diff.js';
import { normPath, checkWrite, LIMITS } from '../core/files.js';
import { templateList, templateFiles } from '../core/templates.js';

const SITE = window.RTY_CONFIG || {};
const SESSION_KEY = 'rty:session';
const modelCatalog = Array.isArray(SITE.modelCatalog) ? SITE.modelCatalog : [];
const groupedModels = modelCatalog.length > 0;
const tangguoUsage = SITE.usageProvider === 'tangguo';

const projects = new Collection('projects');
const tasks = new Collection('tasks');
let session = null; // { accountId, key, nickname, createdAt, apiBaseUrl }
let modelCache = null;
let modelRefresh = null;
let usageLookup = null;
const runs = new Map(); // taskId -> { controller, listeners:Set<fn>, partial }

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let storageErrorShown = false;
const onStorageError = (e) => {
  console.error(e);
  if (!storageErrorShown) {
    storageErrorShown = true;
    alert(`保存数据失败：${e.message}`);
  }
};
projects.onError = onStorageError;
tasks.onError = onStorageError;

function apiCfg() {
  return {
    apiBaseUrl: SITE.apiBaseUrl || '',
    apiKey: session?.key || '',
    stream: SITE.stream !== false,
    temperature: SITE.temperature ?? '',
  };
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

async function activate(s) {
  session = s;
  usageLookup = null;
  try {
    session.avatar = (await idb.get('accounts', s.accountId))?.avatar || null;
  } catch {
    session.avatar = null;
  }
  await projects.load((p) => p.ownerId === s.accountId);
  await tasks.load((t) => t.ownerId === s.accountId);
  // 上次页面关闭时仍在运行的任务
  for (const t of tasks.all()) {
    if (t.status === 'running' || t.status === 'queued') {
      t.status = 'stopped';
      t.error = '页面已关闭，任务被中断';
      tasks.save(t);
    }
  }
}

export async function initLocal() {
  const s = readSession();
  if (s?.key && s.accountId && s.apiBaseUrl === SITE.apiBaseUrl) await activate(s);
  try {
    navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
  window.addEventListener('beforeunload', (e) => {
    if (runs.size) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function publicUser() {
  return session
    ? { id: session.accountId, username: session.nickname, role: 'user', createdAt: session.createdAt, avatar: session.avatar || null }
    : null;
}

const isValidAvatar = (v) => typeof v === 'string' && v.length <= 400000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

async function discoverModels(cfg, signal) {
  const available = await listModels(cfg, signal, { toolsOnly: !groupedModels });
  if (!groupedModels) return available;
  return modelCatalog
    .map(({ id, aliases = [] }) => [id, ...aliases].find((name) => available.includes(name)))
    .filter(Boolean);
}

async function models(refresh = false) {
  if (!groupedModels && Array.isArray(SITE.models) && SITE.models.length) return SITE.models;
  if (!session) return [];
  if (!refresh && modelCache) return modelCache;
  if (!modelRefresh) {
    const activeSession = session;
    const pending = discoverModels(apiCfg(), AbortSignal.timeout(15000))
      .then((list) => {
        if (session !== activeSession) throw new HttpError(401, '登录状态已变更，请重试');
        modelCache = list;
        return list;
      })
      .finally(() => { if (modelRefresh === pending) modelRefresh = null; });
    modelRefresh = pending;
  }
  try {
    return await modelRefresh;
  } catch (e) {
    if (!refresh) return [];
    const detail = e instanceof TypeError ? '浏览器无法访问模型接口，请检查网络或跨域设置（CORS）' : e.message;
    throw new HttpError(e.status === 401 ? 401 : 502, `刷新模型失败：${detail}`);
  }
}

async function config(refresh) {
  const ms = await models(refresh);
  return {
    mode: 'static',
    siteName: SITE.siteName || 'RTY Code',
    configured: !!SITE.apiBaseUrl && ms.length > 0,
    groupedModels,
    models: ms,
    defaultModel: SITE.defaultModel && ms.includes(SITE.defaultModel) ? SITE.defaultModel : ms[0] || '',
    allowRegister: false,
    hasUsers: true,
    loginHint: SITE.loginHint || '',
    templates: templateList(),
    limits: LIMITS,
    user: publicUser(),
  };
}

// ───────────── 项目 / 任务 ─────────────

function ownProject(id) {
  const p = projects.get(id);
  if (!p) throw new HttpError(404, '项目不存在');
  return p;
}
function ownTask(id) {
  const t = tasks.get(id);
  if (!t) throw new HttpError(404, '任务不存在');
  return t;
}

function projectSummary(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    fileCount: Object.keys(p.files).length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    taskCount: tasks.filter((t) => t.projectId === p.id).length,
  };
}

function computeStats(changes) {
  let added = 0;
  let removed = 0;
  const entries = Object.values(changes || {});
  for (const c of entries) {
    const s = diffStats(c.before ?? '', c.after ?? '');
    added += s.added;
    removed += s.removed;
  }
  return { files: entries.length, added, removed };
}

function clone(x) {
  return structuredClone(x);
}

function publicTask(t, full = false) {
  const p = projects.get(t.projectId);
  const out = {
    id: t.id,
    projectId: t.projectId,
    projectName: p ? p.name : '（已删除的项目）',
    title: t.title,
    mode: t.mode,
    model: t.model,
    status: runs.has(t.id) ? 'running' : t.status,
    error: t.error || null,
    archived: !!t.archived,
    stats: t.stats || { files: 0, added: 0, removed: 0 },
    usage: t.usage || null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  if (full) {
    out.history = clone(t.history);
    out.changes = clone(t.changes || {});
  }
  return out;
}


function broadcast(taskId, ev) {
  const run = runs.get(taskId);
  if (!run) return;
  for (const fn of run.listeners) {
    try {
      fn(clone(ev));
    } catch (e) {
      console.error(e);
    }
  }
}

function startRun(task) {
  if (!SITE.apiBaseUrl) throw new HttpError(400, '站点尚未配置 API 地址（config.js）');
  if (!task.model) throw new HttpError(400, '没有可用的模型，请检查 config.js 中的 models');
  const project = projects.get(task.projectId);
  if (!project) throw new HttpError(400, '任务所属项目已被删除');

  const controller = new AbortController();
  const run = { controller, listeners: new Set(), partial: { text: '', reasoning: '' } };
  runs.set(task.id, run);
  task.status = 'running';
  task.error = null;
  task.updatedAt = Date.now();
  tasks.save(task);

  const saveTask = () => {
    if (!tasks.get(task.id)) return;
    task.stats = computeStats(task.changes);
    task.updatedAt = Date.now();
    tasks.save(task);
  };
  const saveProject = () => {
    if (!projects.get(project.id)) return;
    project.updatedAt = Date.now();
    projects.save(project);
  };
  const emit = (ev) => {
    if (ev.type === 'assistant_start') run.partial = { text: '', reasoning: '' };
    else if (ev.type === 'delta') run.partial.text += ev.text;
    else if (ev.type === 'reasoning') run.partial.reasoning += ev.text;
    else if (ev.type === 'message' && ev.message.role === 'assistant') run.partial = { text: '', reasoning: '' };
    if (ev.type === 'changes') return broadcast(task.id, { type: 'changes', changes: task.changes || {}, stats: task.stats });
    broadcast(task.id, ev);
  };

  const cfg = {
    ...apiCfg(),
    protocol: modelCatalog.find(({ id, aliases }) => id === task.model || aliases?.includes(task.model))?.protocol,
    siteName: SITE.siteName || 'RTY Code',
    systemPrompt: SITE.systemPrompt || '',
    maxSteps: SITE.maxSteps || 30,
    model: task.model,
  };

  runAgent({ task, project, config: cfg, signal: controller.signal, emit, saveTask, saveProject })
    .then(() => {
      task.status = 'completed';
    })
    .catch((e) => {
      if (run.partial.text) task.history.push({ role: 'assistant', content: run.partial.text, _at: Date.now(), _partial: true });
      if (controller.signal.aborted) task.status = 'stopped';
      else {
        task.status = 'failed';
        task.error = e?.message || String(e);
        if (/Failed to fetch|NetworkError|Load failed/i.test(task.error)) {
          task.error += '（无法连接模型接口：请检查网络，或该接口不允许浏览器直接访问 / 跨域）';
        }
      }
    })
    .finally(() => {
      saveTask();
      runs.delete(task.id);
      const ev = { type: 'end', task: publicTask(task, true) };
      for (const fn of run.listeners) fn(clone(ev));
      window.dispatchEvent(new CustomEvent('rty:task-end', { detail: { id: task.id, status: task.status } }));
    });
}

async function modelForRun(requested, previous) {
  const activeSession = session;
  const list = await models(groupedModels);
  if (session !== activeSession) throw new HttpError(401, '登录状态已变更，请重试');
  const selected = [requested, previous, SITE.defaultModel].find((id) => list.includes(id)) || list[0];
  if (selected) return selected;
  if (!groupedModels && (requested || previous)) return requested || previous;
  throw new HttpError(400, groupedModels
    ? '当前 API Key 分组没有受支持的模型。请在 API 平台切换分组后刷新模型。'
    : '没有可用的模型，请检查 config.js 中的 models');
}

// ───────────── 路由 ─────────────

const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth !== false });
}

route('GET', '/api/config', ({ query }) => config(query.refreshModels === '1'), { auth: false });
route('GET', '/api/health', () => ({ ok: true, mode: 'static' }), { auth: false });

route(
  'POST',
  '/api/auth/login',
  async ({ body }) => {
    const key = String(body.key || '').trim();
    const nickname = String(body.nickname || '').trim().slice(0, 32);
    if (!key) throw new HttpError(400, '请输入 API Key');
    if (!SITE.apiBaseUrl) throw new HttpError(400, '站点尚未配置 API 地址（config.js）');
    const cfg = { apiBaseUrl: SITE.apiBaseUrl, apiKey: key };
    const signal = AbortSignal.timeout(15000);
    let info;
    let discoveredModels = null;
    try {
      if (!groupedModels && !tangguoUsage) info = await getKeyInfo(cfg, signal);
      if (!info) discoveredModels = await discoverModels(cfg, signal);
    } catch (e) {
      if (e.status === 401 || e.status === 403) throw new HttpError(401, 'API Key 无效，请检查是否复制完整');
      if (e instanceof TypeError) throw new HttpError(502, '浏览器无法连接模型接口。请检查网络，以及 API 提供方是否允许当前站点跨域访问（CORS）。');
      throw new HttpError(502, `验证 Key 失败：${e.message}`);
    }
    const accountId = (await sha256Hex(key)).slice(0, 16);
    let acct = await idb.get('accounts', accountId).catch(() => null);
    if (!acct) acct = { id: accountId, nickname: nickname || info?.label || '同学', createdAt: Date.now() };
    else if (nickname) acct.nickname = nickname;
    await idb.put('accounts', acct);
    const s = { accountId, key, nickname: acct.nickname, createdAt: acct.createdAt, apiBaseUrl: cfg.apiBaseUrl };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    modelCache = discoveredModels;
    modelRefresh = null;
    await activate(s);
    return { user: publicUser() };
  },
  { auth: false },
);

route(
  'POST',
  '/api/auth/logout',
  () => {
    for (const r of runs.values()) r.controller.abort();
    localStorage.removeItem(SESSION_KEY);
    session = null;
    usageLookup = null;
    modelCache = null;
    modelRefresh = null;
    projects.items.clear();
    tasks.items.clear();
    return { ok: true };
  },
  { auth: false },
);

route('GET', '/api/auth/me', () => ({ user: publicUser() }));

route('POST', '/api/auth/nickname', async ({ body }) => {
  const n = String(body.nickname || '').trim().slice(0, 32);
  if (!n) throw new HttpError(400, '昵称不能为空');
  session.nickname = n;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, avatar: undefined }));
  const acct = (await idb.get('accounts', session.accountId)) || { id: session.accountId, createdAt: session.createdAt };
  acct.nickname = n;
  await idb.put('accounts', acct);
  return { user: publicUser() };
});

// 头像保存在本地账号记录中（不放进 localStorage 的会话里）
route('POST', '/api/auth/avatar', async ({ body }) => {
  const avatar = body.avatar ?? null;
  if (avatar !== null && !isValidAvatar(avatar)) throw new HttpError(400, '头像格式不正确或文件过大');
  const acct = (await idb.get('accounts', session.accountId)) || { id: session.accountId, nickname: session.nickname, createdAt: session.createdAt };
  if (avatar) acct.avatar = avatar;
  else delete acct.avatar;
  await idb.put('accounts', acct);
  session.avatar = avatar;
  return { user: publicUser() };
});

function personalUsage(refresh) {
  if (usageLookup?.session !== session) usageLookup = { session };
  const lookup = usageLookup;
  if (lookup.pending) return lookup.pending;
  if (!refresh && Date.now() - (lookup.fetchedAt || 0) < 30000) return lookup.data;
  lookup.pending = getTangguoUsage(apiCfg(), AbortSignal.timeout(15000))
    .then((data) => {
      if (lookup.session !== session) throw new Error('登录状态已变更，请重新查询');
      lookup.data = data || { unsupported: true, source: 'tangguo' };
      lookup.fetchedAt = Date.now();
      return lookup.data;
    })
    .finally(() => { lookup.pending = null; });
  return lookup.pending;
}

route('GET', '/api/balance', async ({ query }) => {
  if (!tangguoUsage && groupedModels) return { unsupported: true };
  try {
    if (tangguoUsage) return await personalUsage(query.refresh === '1');
    const info = await getKeyInfo(apiCfg(), AbortSignal.timeout(15000));
    return info || { unsupported: true };
  } catch (e) {
    if (tangguoUsage) {
      const detail = e instanceof TypeError ? '请检查网络或站点代理是否转发 /v1/usage' : e.message;
      throw new HttpError(502, `用量查询失败：${detail}`);
    }
    throw new HttpError(e.status === 401 ? 401 : 502, e.message);
  }
});

route('GET', '/api/session/key', () => ({ masked: session.key.slice(0, 8) + '••••••' + session.key.slice(-4) }));

// 导出 / 导入
route('GET', '/api/backup', () => ({
  app: 'rty-code',
  version: 1,
  exportedAt: Date.now(),
  nickname: session.nickname,
  projects: clone(projects.all()),
  tasks: clone(tasks.all()),
}));

route('POST', '/api/backup', ({ body }) => {
  if (body.app !== 'rty-code' || !Array.isArray(body.projects) || !Array.isArray(body.tasks)) throw new HttpError(400, '备份文件格式不正确');
  let np = 0;
  let nt = 0;
  for (const p of body.projects) {
    if (!p.id || typeof p.files !== 'object') continue;
    projects.save({ ...p, ownerId: session.accountId });
    np++;
  }
  for (const t of body.tasks) {
    if (!t.id || !Array.isArray(t.history)) continue;
    if (t.status === 'running' || t.status === 'queued') t.status = 'stopped';
    tasks.save({ ...t, ownerId: session.accountId });
    nt++;
  }
  return { projects: np, tasks: nt };
});

route('DELETE', '/api/backup', () => {
  for (const r of runs.values()) r.controller.abort();
  for (const t of tasks.all()) tasks.remove(t.id);
  for (const p of projects.all()) projects.remove(p.id);
  return { ok: true };
});

// 项目
route('GET', '/api/projects', () => projects.all().sort((a, b) => b.updatedAt - a.updatedAt).map(projectSummary));

route('POST', '/api/projects', ({ body }) => {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) throw new HttpError(400, '请输入项目名称');
  const p = projects.save({
    id: newId(),
    ownerId: session.accountId,
    name,
    description: String(body.description || '').slice(0, 500),
    instructions: '',
    files: templateFiles(body.template, name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return projectSummary(p);
});

route('GET', '/api/projects/:id', ({ params }) => {
  const p = ownProject(params.id);
  return { ...projectSummary(p), instructions: p.instructions || '', files: clone(p.files) };
});

route('PATCH', '/api/projects/:id', ({ params, body }) => {
  const p = ownProject(params.id);
  if (body.name !== undefined) {
    const n = String(body.name).trim().slice(0, 60);
    if (!n) throw new HttpError(400, '项目名称不能为空');
    p.name = n;
  }
  if (body.description !== undefined) p.description = String(body.description).slice(0, 500);
  if (body.instructions !== undefined) p.instructions = String(body.instructions).slice(0, 20000);
  p.updatedAt = Date.now();
  projects.save(p);
  return projectSummary(p);
});

route('DELETE', '/api/projects/:id', ({ params }) => {
  const p = ownProject(params.id);
  for (const t of tasks.filter((t) => t.projectId === p.id)) {
    runs.get(t.id)?.controller.abort();
    tasks.remove(t.id);
  }
  projects.remove(p.id);
  return { ok: true };
});

route('PUT', '/api/projects/:id/files', ({ params, body }) => {
  const p = ownProject(params.id);
  const next = { ...p.files };
  try {
    for (const d of Array.isArray(body.delete) ? body.delete : []) {
      const np = normPath(d);
      delete next[np];
      for (const k of Object.keys(next)) if (k.startsWith(np + '/')) delete next[k];
    }
    for (const [k, v] of Object.entries(body.files || {})) {
      const np = checkWrite(next, k, v);
      next[np] = v;
    }
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  p.files = next;
  p.updatedAt = Date.now();
  projects.save(p);
  return { files: clone(p.files) };
});

route('POST', '/api/projects/:id/rename', ({ params, body }) => {
  const p = ownProject(params.id);
  let from;
  let to;
  try {
    from = normPath(body.from);
    to = normPath(body.to);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const next = {};
  let moved = 0;
  for (const [k, v] of Object.entries(p.files)) {
    if (k === from) {
      next[to] = v;
      moved++;
    } else if (k.startsWith(from + '/')) {
      next[to + k.slice(from.length)] = v;
      moved++;
    } else next[k] = v;
  }
  if (!moved) throw new HttpError(404, '文件不存在');
  if (Object.keys(next).length !== Object.keys(p.files).length) throw new HttpError(409, '目标路径已存在');
  p.files = next;
  p.updatedAt = Date.now();
  projects.save(p);
  return { files: clone(p.files) };
});

// 任务
route('GET', '/api/tasks', ({ query }) => {
  let list = tasks.all();
  if (query.projectId) list = list.filter((t) => t.projectId === query.projectId);
  return list.sort((a, b) => b.createdAt - a.createdAt).map((t) => publicTask(t));
});

route('POST', '/api/tasks', async ({ body }) => {
  let userMsg;
  try {
    userMsg = buildUserMessage(body.prompt, body.attachments);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const model = await modelForRun(body.model);
  const project = ownProject(body.projectId);
  const mode = 'code';
  const task = {
    id: newId(),
    ownerId: session.accountId,
    projectId: project.id,
    title: titleFromMessage(userMsg),
    mode,
    model,
    status: 'queued',
    history: [userMsg],
    changes: {},
    stats: { files: 0, added: 0, removed: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.save(task);
  startRun(task);
  return publicTask(task, true);
});

route('GET', '/api/tasks/:id', ({ params }) => publicTask(ownTask(params.id), true));

route('PATCH', '/api/tasks/:id', ({ params, body }) => {
  const t = ownTask(params.id);
  if (body.title !== undefined) t.title = String(body.title).trim().slice(0, 100) || t.title;
  if (body.archived !== undefined) t.archived = !!body.archived;
  t.updatedAt = Date.now();
  tasks.save(t);
  return publicTask(t);
});

route('DELETE', '/api/tasks/:id', ({ params }) => {
  const t = ownTask(params.id);
  runs.get(t.id)?.controller.abort();
  tasks.remove(t.id);
  return { ok: true };
});

route('POST', '/api/tasks/:id/messages', async ({ params, body }) => {
  const t = ownTask(params.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务正在运行，请等待完成或先停止');
  let userMsg;
  try {
    userMsg = buildUserMessage(body.prompt, body.attachments);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const model = await modelForRun(body.model, t.model);
  ownTask(t.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务正在运行，请等待完成或先停止');
  t.mode = 'code';
  t.model = model;
  t.history.push(userMsg);
  startRun(t);
  return publicTask(t, true);
});

route('POST', '/api/tasks/:id/retry', async ({ params, body }) => {
  const t = ownTask(params.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务正在运行');
  const model = await modelForRun(body.model, t.model);
  ownTask(t.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务正在运行');
  t.model = model;
  while (t.history.length && t.history[t.history.length - 1]._partial) t.history.pop();
  startRun(t);
  return publicTask(t, true);
});

route('POST', '/api/tasks/:id/stop', ({ params }) => {
  const t = ownTask(params.id);
  runs.get(t.id)?.controller.abort();
  return { ok: true };
});

route('POST', '/api/tasks/:id/revert', ({ params, body }) => {
  const t = ownTask(params.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务运行中，无法撤销');
  const p = projects.get(t.projectId);
  if (!p) throw new HttpError(400, '项目已被删除');
  const targets = Array.isArray(body.paths) && body.paths.length ? body.paths : Object.keys(t.changes || {});
  for (const path of targets) {
    const c = t.changes?.[path];
    if (!c) continue;
    if (c.before == null) delete p.files[path];
    else p.files[path] = c.before;
    delete t.changes[path];
  }
  p.updatedAt = Date.now();
  projects.save(p);
  t.stats = computeStats(t.changes);
  t.updatedAt = Date.now();
  tasks.save(t);
  return publicTask(t, true);
});

/** 与 fetch 版本相同的接口：返回数据或抛出带 status 的错误 */
export async function localRequest(method, url, body) {
  const u = new URL(url, location.origin);
  for (const r of routes) {
    const m = u.pathname.match(r.re);
    if (!m || r.method !== method) continue;
    if (r.auth && !session) throw new HttpError(401, '请先登录');
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return r.handler({ params, body: body ? clone(body) : {}, query: Object.fromEntries(u.searchParams) });
  }
  throw new HttpError(404, `本地模式不支持该操作：${method} ${u.pathname}`);
}

/** 任务事件流：先推送快照，运行中则持续推送，结束时 resolve */
export function localStream(url, onEvent, signal) {
  const m = url.match(/\/api\/tasks\/([^/]+)\/events/);
  return new Promise((resolve, reject) => {
    if (!session) return reject(new HttpError(401, '请先登录'));
    const t = m && tasks.get(m[1]);
    if (!t) return reject(new HttpError(404, '任务不存在'));
    const run = runs.get(t.id);
    onEvent({ type: 'snapshot', task: publicTask(t, true), partial: run ? clone(run.partial) : null });
    if (!run) {
      onEvent({ type: 'end', task: publicTask(t, true) });
      return resolve();
    }
    const fn = (ev) => {
      onEvent(ev);
      if (ev.type === 'end') {
        run.listeners.delete(fn);
        resolve();
      }
    };
    run.listeners.add(fn);
    signal?.addEventListener('abort', () => {
      run.listeners.delete(fn);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
