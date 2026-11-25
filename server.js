'use strict';
/**
 * RTY Code —— 代码编写智能体网站
 * 零依赖 Node.js 服务（Node 18+）：静态页面 + REST API + 智能体运行 + 流式推送
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

require('./lib/env').load(path.join(__dirname, '.env'));

const { createStore, newId } = require('./lib/store');
const auth = require('./lib/auth');
// 智能体核心代码与前端共用（ES 模块，位于 public/js/core），在 bootstrap 中加载
let runAgent, buildUserMessage, titleFromMessage, llm, diffStats, normPath, checkWrite, LIMITS, templateList, templateFiles;
async function loadCore() {
  const core = (name) => import(require('url').pathToFileURL(path.join(__dirname, 'public/js/core', name)).href);
  ({ runAgent, buildUserMessage, titleFromMessage } = await core('agent.js'));
  llm = await core('llm.js');
  ({ diffStats } = await core('diff.js'));
  ({ normPath, checkWrite, LIMITS } = await core('files.js'));
  ({ templateList, templateFiles } = await core('templates.js'));
}

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = parseInt(process.env.SESSION_DAYS, 10) || 30;
const MAX_BODY = 25 * 1024 * 1024;

const store = createStore(DATA_DIR);
const loginLimiter = new auth.RateLimiter();

// ───────────────────────── 配置 ─────────────────────────

function splitList(s) {
  return String(s || '')
    .split(/[,，\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function config() {
  const s = store.settings.get();
  const models = Array.isArray(s.models) && s.models.length ? s.models : splitList(process.env.MODELS || process.env.MODEL);
  return {
    siteName: s.siteName || process.env.SITE_NAME || 'RTY Code',
    apiBaseUrl: s.apiBaseUrl || process.env.API_BASE_URL || '',
    apiKey: s.apiKey || process.env.API_KEY || '',
    models,
    defaultModel: (s.defaultModel && models.includes(s.defaultModel) ? s.defaultModel : null) || process.env.DEFAULT_MODEL || models[0] || '',
    allowRegister: s.allowRegister ?? process.env.ALLOW_REGISTER !== 'false',
    systemPrompt: s.systemPrompt ?? process.env.SYSTEM_PROMPT ?? '',
    maxSteps: s.maxSteps || parseInt(process.env.MAX_STEPS, 10) || 30,
    stream: s.stream ?? process.env.STREAM !== 'false',
    temperature: s.temperature ?? process.env.TEMPERATURE ?? '',
  };
}

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return '••••••';
  return `${k.slice(0, 4)}••••••${k.slice(-4)}`;
}

// ───────────────────────── 工具函数 ─────────────────────────

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, '请求体不是合法的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0].trim() : '') || req.socket.remoteAddress || '';
}

function isHttps(req) {
  return req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function sessionCookie(req, token, maxAge) {
  const parts = [`sid=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt, avatar: u.avatar || null };
}

const isValidAvatar = (v) => typeof v === 'string' && v.length <= 400000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

function currentUser(req) {
  const token = auth.parseCookies(req.headers.cookie).sid;
  if (!token) return null;
  const s = store.sessions.get(auth.tokenId(token));
  if (!s) return null;
  if (s.expires < Date.now()) {
    store.sessions.remove(s.id);
    return null;
  }
  const u = store.users.get(s.userId);
  return u || null;
}

async function createSession(req, res, user) {
  const token = auth.newToken();
  store.sessions.save({
    id: auth.tokenId(token),
    userId: user.id,
    createdAt: Date.now(),
    expires: Date.now() + SESSION_DAYS * 86400e3,
    ua: String(req.headers['user-agent'] || '').slice(0, 200),
  });
  res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_DAYS * 86400));
}

function cleanupSessions() {
  const now = Date.now();
  for (const s of store.sessions.all()) if (s.expires < now) store.sessions.remove(s.id);
}

// ───────────────────────── 项目 / 任务 ─────────────────────────

function ownProject(user, id) {
  const p = store.projects.get(id);
  if (!p || p.ownerId !== user.id) throw new HttpError(404, '项目不存在');
  return p;
}

function ownTask(user, id) {
  const t = store.tasks.get(id);
  if (!t || t.ownerId !== user.id) throw new HttpError(404, '任务不存在');
  return t;
}

function projectSummary(p) {
  const files = Object.keys(p.files);
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    fileCount: files.length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    taskCount: store.tasks.filter((t) => t.projectId === p.id).length,
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

function publicTask(t, full = false) {
  const p = store.projects.get(t.projectId);
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
    out.history = t.history;
    out.changes = t.changes || {};
  }
  return out;
}


// 运行中的任务：taskId -> { controller, listeners:Set<res>, partial }
const runs = new Map();

function broadcast(taskId, event) {
  const run = runs.get(taskId);
  if (!run) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.listeners) {
    try {
      res.write(data);
    } catch {
      /* 连接已断开 */
    }
  }
}

function startRun(task) {
  const cfg = config();
  if (!cfg.apiBaseUrl) throw new HttpError(400, '管理员尚未配置模型 API 地址');
  if (!task.model) throw new HttpError(400, '没有可用的模型，请管理员先配置模型列表');
  const project = store.projects.get(task.projectId);
  if (!project) throw new HttpError(400, '任务所属项目已被删除');

  const controller = new AbortController();
  const run = { controller, listeners: new Set(), partial: { text: '', reasoning: '' } };
  runs.set(task.id, run);
  task.status = 'running';
  task.error = null;
  task.updatedAt = Date.now();
  store.tasks.save(task);

  // 任务/项目在运行中可能被删除，此时不再写回
  const saveTask = () => {
    if (!store.tasks.get(task.id)) return;
    task.stats = computeStats(task.changes);
    task.updatedAt = Date.now();
    store.tasks.save(task);
  };
  const saveProject = () => {
    if (!store.projects.get(project.id)) return;
    project.updatedAt = Date.now();
    store.projects.save(project);
  };
  const emit = (ev) => {
    if (ev.type === 'assistant_start') run.partial = { text: '', reasoning: '' };
    else if (ev.type === 'delta') run.partial.text += ev.text;
    else if (ev.type === 'reasoning') run.partial.reasoning += ev.text;
    else if (ev.type === 'message' && ev.message.role === 'assistant') run.partial = { text: '', reasoning: '' };
    if (ev.type === 'changes') {
      broadcast(task.id, { type: 'changes', changes: task.changes || {}, stats: task.stats });
      return;
    }
    broadcast(task.id, ev);
  };

  runAgent({ task, project, config: { ...cfg, model: task.model }, signal: controller.signal, emit, saveTask, saveProject })
    .then(() => {
      task.status = 'completed';
    })
    .catch((e) => {
      if (controller.signal.aborted) {
        // 保留已经生成的部分回复
        if (run.partial.text) task.history.push({ role: 'assistant', content: run.partial.text, _at: Date.now(), _partial: true });
        task.status = 'stopped';
      } else {
        task.status = 'failed';
        task.error = e && e.message ? e.message : String(e);
        if (run.partial.text) task.history.push({ role: 'assistant', content: run.partial.text, _at: Date.now(), _partial: true });
        console.warn(`[task ${task.id}] 运行失败: ${task.error}`);
      }
    })
    .finally(() => {
      saveTask();
      runs.delete(task.id);
      const data = `data: ${JSON.stringify({ type: 'end', task: publicTask(task, true) })}\n\n`;
      for (const res of run.listeners) {
        try {
          res.end(data);
        } catch {
          /* ignore */
        }
      }
    });
}

function pickModel(requested) {
  const cfg = config();
  if (requested && (cfg.models.includes(requested) || !cfg.models.length)) return String(requested).slice(0, 200);
  return cfg.defaultModel;
}

// ───────────────────────── 路由 ─────────────────────────

const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/:(\w+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ method, re, keys, handler, auth: opts.auth !== false, admin: !!opts.admin, raw: !!opts.raw });
}

// —— 公共 ——
route(
  'GET',
  '/api/config',
  ({ user }) => {
    const cfg = config();
    return {
      mode: 'server',
      siteName: cfg.siteName,
      configured: !!cfg.apiBaseUrl && cfg.models.length > 0,
      models: cfg.models,
      defaultModel: cfg.defaultModel,
      allowRegister: cfg.allowRegister || store.users.all().length === 0,
      hasUsers: store.users.all().length > 0,
      templates: templateList(),
      limits: LIMITS,
      user: user ? publicUser(user) : null,
    };
  },
  { auth: false },
);

// —— 账号 ——
route(
  'POST',
  '/api/auth/register',
  async ({ req, res, body }) => {
    const cfg = config();
    const first = store.users.all().length === 0;
    if (!first && !cfg.allowRegister) throw new HttpError(403, '本站已关闭注册，请联系管理员创建账号');
    const err = auth.validateUsername(body.username) || auth.validatePassword(body.password);
    if (err) throw new HttpError(400, err);
    const username = body.username.trim();
    if (store.users.find((u) => u.username.toLowerCase() === username.toLowerCase())) throw new HttpError(409, '用户名已被占用');
    const user = store.users.save({
      id: newId(),
      username,
      passwordHash: await auth.hashPassword(body.password),
      role: first ? 'admin' : 'user',
      createdAt: Date.now(),
    });
    await createSession(req, res, user);
    return { user: publicUser(user) };
  },
  { auth: false },
);

route(
  'POST',
  '/api/auth/login',
  async ({ req, res, body }) => {
    const ip = clientIp(req);
    if (loginLimiter.blocked(ip)) throw new HttpError(429, '登录失败次数过多，请 15 分钟后再试');
    const username = String(body.username || '').trim();
    const user = store.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    const ok = user ? await auth.verifyPassword(String(body.password || ''), user.passwordHash) : false;
    if (!ok) {
      loginLimiter.fail(ip);
      throw new HttpError(401, '用户名或密码错误');
    }
    loginLimiter.clear(ip);
    await createSession(req, res, user);
    return { user: publicUser(user) };
  },
  { auth: false },
);

route(
  'POST',
  '/api/auth/logout',
  ({ req, res }) => {
    const token = auth.parseCookies(req.headers.cookie).sid;
    if (token) store.sessions.remove(auth.tokenId(token));
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return { ok: true };
  },
  { auth: false },
);

route('GET', '/api/auth/me', ({ user }) => ({ user: publicUser(user) }));

route('POST', '/api/auth/avatar', ({ user, body }) => {
  const avatar = body.avatar ?? null;
  if (avatar !== null && !isValidAvatar(avatar)) throw new HttpError(400, '头像格式不正确或文件过大');
  if (avatar) user.avatar = avatar;
  else delete user.avatar;
  store.users.save(user);
  return { user: publicUser(user) };
});

route('POST', '/api/auth/password', async ({ req, user, body }) => {
  if (!(await auth.verifyPassword(String(body.oldPassword || ''), user.passwordHash))) throw new HttpError(400, '当前密码不正确');
  const err = auth.validatePassword(body.newPassword);
  if (err) throw new HttpError(400, err);
  user.passwordHash = await auth.hashPassword(body.newPassword);
  store.users.save(user);
  // 让其他设备上的会话失效
  const current = auth.tokenId(auth.parseCookies(req.headers.cookie).sid || '');
  for (const s of store.sessions.filter((s) => s.userId === user.id && s.id !== current)) store.sessions.remove(s.id);
  return { ok: true };
});

// —— 项目 ——
route('GET', '/api/projects', ({ user }) =>
  store.projects
    .filter((p) => p.ownerId === user.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(projectSummary),
);

route('POST', '/api/projects', ({ user, body }) => {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) throw new HttpError(400, '请输入项目名称');
  const p = store.projects.save({
    id: newId(),
    ownerId: user.id,
    name,
    description: String(body.description || '').slice(0, 500),
    instructions: '',
    files: templateFiles(body.template, name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return projectSummary(p);
});

route('GET', '/api/projects/:id', ({ user, params }) => {
  const p = ownProject(user, params.id);
  return { ...projectSummary(p), instructions: p.instructions || '', files: p.files };
});

route('PATCH', '/api/projects/:id', ({ user, params, body }) => {
  const p = ownProject(user, params.id);
  if (body.name !== undefined) {
    const n = String(body.name).trim().slice(0, 60);
    if (!n) throw new HttpError(400, '项目名称不能为空');
    p.name = n;
  }
  if (body.description !== undefined) p.description = String(body.description).slice(0, 500);
  if (body.instructions !== undefined) p.instructions = String(body.instructions).slice(0, 20000);
  p.updatedAt = Date.now();
  store.projects.save(p);
  return projectSummary(p);
});

route('DELETE', '/api/projects/:id', ({ user, params }) => {
  const p = ownProject(user, params.id);
  for (const t of store.tasks.filter((t) => t.projectId === p.id)) {
    runs.get(t.id)?.controller.abort();
    store.tasks.remove(t.id);
  }
  store.projects.remove(p.id);
  return { ok: true };
});

// 批量写入文件：{ files: { path: content } }，可选 { delete: [path] }
route('PUT', '/api/projects/:id/files', ({ user, params, body }) => {
  const p = ownProject(user, params.id);
  const next = { ...p.files };
  for (const d of Array.isArray(body.delete) ? body.delete : []) {
    const np = normPath(d);
    delete next[np];
    // 删除目录
    for (const k of Object.keys(next)) if (k.startsWith(np + '/')) delete next[k];
  }
  try {
    for (const [k, v] of Object.entries(body.files || {})) {
      const np = checkWrite(next, k, v);
      next[np] = v;
    }
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  p.files = next;
  p.updatedAt = Date.now();
  store.projects.save(p);
  return { files: p.files };
});

route('POST', '/api/projects/:id/rename', ({ user, params, body }) => {
  const p = ownProject(user, params.id);
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
  store.projects.save(p);
  return { files: p.files };
});

// —— 任务 ——
route('GET', '/api/tasks', ({ user, query }) => {
  let list = store.tasks.filter((t) => t.ownerId === user.id);
  if (query.projectId) list = list.filter((t) => t.projectId === query.projectId);
  return list.sort((a, b) => b.createdAt - a.createdAt).map((t) => publicTask(t));
});

route('POST', '/api/tasks', ({ user, body }) => {
  let userMsg;
  try {
    userMsg = buildUserMessage(body.prompt, body.attachments);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const project = ownProject(user, body.projectId);
  const task = {
    id: newId(),
    ownerId: user.id,
    projectId: project.id,
    title: titleFromMessage(userMsg),
    mode: 'code',
    model: pickModel(body.model),
    status: 'queued',
    history: [userMsg],
    changes: {},
    stats: { files: 0, added: 0, removed: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.tasks.save(task);
  startRun(task);
  return publicTask(task, true);
});

route('GET', '/api/tasks/:id', ({ user, params }) => publicTask(ownTask(user, params.id), true));

route('PATCH', '/api/tasks/:id', ({ user, params, body }) => {
  const t = ownTask(user, params.id);
  if (body.title !== undefined) t.title = String(body.title).trim().slice(0, 100) || t.title;
  if (body.archived !== undefined) t.archived = !!body.archived;
  t.updatedAt = Date.now();
  store.tasks.save(t);
  return publicTask(t);
});

route('DELETE', '/api/tasks/:id', ({ user, params }) => {
  const t = ownTask(user, params.id);
  runs.get(t.id)?.controller.abort();
  store.tasks.remove(t.id);
  return { ok: true };
});

route('POST', '/api/tasks/:id/messages', ({ user, params, body }) => {
  const t = ownTask(user, params.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务正在运行，请等待完成或先停止');
  let userMsg;
  try {
    userMsg = buildUserMessage(body.prompt, body.attachments);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  t.mode = 'code';
  if (body.model) t.model = pickModel(body.model);
  if (!t.model) t.model = pickModel();
  t.history.push(userMsg);
  startRun(t);
  return publicTask(t, true);
});

// 不追加新消息，直接重新运行（用于失败后重试）
route('POST', '/api/tasks/:id/retry', ({ user, params, body }) => {
  const t = ownTask(user, params.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务正在运行');
  if (body.model) t.model = pickModel(body.model);
  if (!t.model) t.model = pickModel();
  // 去掉失败时残留的半截回复
  while (t.history.length && t.history[t.history.length - 1]._partial) t.history.pop();
  startRun(t);
  return publicTask(t, true);
});

route('POST', '/api/tasks/:id/stop', ({ user, params }) => {
  const t = ownTask(user, params.id);
  runs.get(t.id)?.controller.abort();
  return { ok: true };
});

// 撤销任务产生的全部或部分修改：{ paths?: string[] }
route('POST', '/api/tasks/:id/revert', ({ user, params, body }) => {
  const t = ownTask(user, params.id);
  if (runs.has(t.id)) throw new HttpError(409, '任务运行中，无法撤销');
  const p = store.projects.get(t.projectId);
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
  store.projects.save(p);
  t.stats = computeStats(t.changes);
  t.updatedAt = Date.now();
  store.tasks.save(t);
  return publicTask(t, true);
});

// 事件流：先发快照，运行中则持续推送增量
route(
  'GET',
  '/api/tasks/:id/events',
  ({ req, res, user, params }) => {
    const t = ownTask(user, params.id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const run = runs.get(t.id);
    res.write(`data: ${JSON.stringify({ type: 'snapshot', task: publicTask(t, true), partial: run ? run.partial : null })}\n\n`);
    if (!run) {
      res.end(`data: ${JSON.stringify({ type: 'end', task: publicTask(t, true) })}\n\n`);
      return;
    }
    run.listeners.add(res);
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        /* ignore */
      }
    }, 15000);
    req.on('close', () => {
      clearInterval(ping);
      run.listeners.delete(res);
    });
  },
  { raw: true },
);

// —— 管理员 ——
route(
  'GET',
  '/api/admin/settings',
  () => {
    const cfg = config();
    return { ...cfg, apiKey: maskKey(cfg.apiKey), hasApiKey: !!cfg.apiKey };
  },
  { admin: true },
);

route(
  'PUT',
  '/api/admin/settings',
  (ctx) => {
    const b = ctx.body;
    const patch = {};
    if (b.siteName !== undefined) patch.siteName = String(b.siteName).trim().slice(0, 40);
    if (b.apiBaseUrl !== undefined) {
      const u = String(b.apiBaseUrl).trim();
      if (u && !/^https?:\/\//i.test(u)) throw new HttpError(400, 'API 地址需以 http:// 或 https:// 开头');
      patch.apiBaseUrl = u;
    }
    // 只有提交了新的 Key 才覆盖（前端显示的是掩码）
    if (typeof b.apiKey === 'string' && b.apiKey && !b.apiKey.includes('••')) patch.apiKey = b.apiKey.trim();
    if (b.clearApiKey) patch.apiKey = '';
    if (b.models !== undefined) patch.models = Array.isArray(b.models) ? b.models.map(String).map((s) => s.trim()).filter(Boolean) : splitList(b.models);
    if (b.defaultModel !== undefined) patch.defaultModel = String(b.defaultModel).trim();
    if (b.allowRegister !== undefined) patch.allowRegister = !!b.allowRegister;
    if (b.systemPrompt !== undefined) patch.systemPrompt = String(b.systemPrompt).slice(0, 20000);
    if (b.maxSteps !== undefined) patch.maxSteps = Math.max(1, Math.min(100, parseInt(b.maxSteps, 10) || 30));
    if (b.stream !== undefined) patch.stream = !!b.stream;
    if (b.temperature !== undefined) {
      const t = String(b.temperature).trim();
      if (t && (isNaN(Number(t)) || Number(t) < 0 || Number(t) > 2)) throw new HttpError(400, 'temperature 需在 0–2 之间');
      patch.temperature = t;
    }
    store.settings.update(patch);
    const cfg = config();
    return { ...cfg, apiKey: maskKey(cfg.apiKey), hasApiKey: !!cfg.apiKey };
  },
  { admin: true },
);

// 用提交的（或已保存的）配置拉取模型列表
function testConfig(body) {
  const cfg = config();
  const out = { ...cfg };
  if (body.apiBaseUrl) out.apiBaseUrl = String(body.apiBaseUrl).trim();
  if (typeof body.apiKey === 'string' && body.apiKey && !body.apiKey.includes('••')) out.apiKey = body.apiKey.trim();
  return out;
}

route(
  'POST',
  '/api/admin/models',
  async ({ body }) => {
    try {
      return { models: await llm.listModels(testConfig(body), AbortSignal.timeout(20000)) };
    } catch (e) {
      throw new HttpError(502, `拉取模型列表失败：${e.message}`);
    }
  },
  { admin: true },
);

route(
  'POST',
  '/api/admin/test',
  async ({ body }) => {
    const cfg = testConfig(body);
    const model = String(body.model || cfg.defaultModel || '').trim();
    if (!model) throw new HttpError(400, '请先填写模型名称');
    const started = Date.now();
    try {
      const r = await llm.chat(
        { ...cfg, stream: false },
        { model, messages: [{ role: 'user', content: '请只回复：连接成功' }], max_tokens: 20 },
        { signal: AbortSignal.timeout(60000) },
      );
      return { ok: true, model, reply: (r.content || r.reasoning || '').slice(0, 200), ms: Date.now() - started };
    } catch (e) {
      throw new HttpError(502, `连接失败：${e.message}`);
    }
  },
  { admin: true },
);

route(
  'GET',
  '/api/admin/users',
  () =>
    store.users
      .all()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((u) => ({
        ...publicUser(u),
        projectCount: store.projects.filter((p) => p.ownerId === u.id).length,
        taskCount: store.tasks.filter((t) => t.ownerId === u.id).length,
      })),
  { admin: true },
);

route(
  'POST',
  '/api/admin/users',
  async ({ body }) => {
    const err = auth.validateUsername(body.username) || auth.validatePassword(body.password);
    if (err) throw new HttpError(400, err);
    const username = body.username.trim();
    if (store.users.find((u) => u.username.toLowerCase() === username.toLowerCase())) throw new HttpError(409, '用户名已被占用');
    const u = store.users.save({
      id: newId(),
      username,
      passwordHash: await auth.hashPassword(body.password),
      role: body.role === 'admin' ? 'admin' : 'user',
      createdAt: Date.now(),
    });
    return publicUser(u);
  },
  { admin: true },
);

route(
  'PATCH',
  '/api/admin/users/:id',
  async ({ user, params, body }) => {
    const u = store.users.get(params.id);
    if (!u) throw new HttpError(404, '用户不存在');
    if (body.role !== undefined) {
      if (u.id === user.id && body.role !== 'admin') throw new HttpError(400, '不能取消自己的管理员身份');
      u.role = body.role === 'admin' ? 'admin' : 'user';
    }
    if (body.password !== undefined) {
      const err = auth.validatePassword(body.password);
      if (err) throw new HttpError(400, err);
      u.passwordHash = await auth.hashPassword(body.password);
      for (const s of store.sessions.filter((s) => s.userId === u.id)) store.sessions.remove(s.id);
    }
    store.users.save(u);
    return publicUser(u);
  },
  { admin: true },
);

route(
  'DELETE',
  '/api/admin/users/:id',
  ({ user, params }) => {
    if (params.id === user.id) throw new HttpError(400, '不能删除自己');
    const u = store.users.get(params.id);
    if (!u) throw new HttpError(404, '用户不存在');
    for (const t of store.tasks.filter((t) => t.ownerId === u.id)) {
      runs.get(t.id)?.controller.abort();
      store.tasks.remove(t.id);
    }
    for (const p of store.projects.filter((p) => p.ownerId === u.id)) store.projects.remove(p.id);
    for (const s of store.sessions.filter((s) => s.userId === u.id)) store.sessions.remove(s.id);
    store.users.remove(u.id);
    return { ok: true };
  },
  { admin: true },
);

route('GET', '/api/health', () => ({ ok: true, mode: 'server', time: Date.now() }), { auth: false });

// ───────────────────────── 静态文件 ─────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    rel = pathname;
  }
  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    else if (err) file = path.join(PUBLIC_DIR, 'index.html'); // 单页应用回退
    fs.readFile(file, (err2, buf) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  });
}

// ───────────────────────── 服务器 ─────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    serveStatic(req, res, pathname);
    return;
  }

  try {
    let matched = null;
    let methodMismatch = false;
    for (const r of routes) {
      const m = pathname.match(r.re);
      if (!m) continue;
      if (r.method !== req.method) {
        methodMismatch = true;
        continue;
      }
      matched = { r, m };
      break;
    }
    if (!matched) throw new HttpError(methodMismatch ? 405 : 404, methodMismatch ? '不支持的请求方法' : '接口不存在');

    const { r, m } = matched;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

    // 防 CSRF：修改类请求必须带自定义请求头（跨站表单无法伪造）
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') throw new HttpError(403, '缺少请求头');

    const user = currentUser(req);
    if (r.auth && !user) throw new HttpError(401, '请先登录');
    if (r.admin && user.role !== 'admin') throw new HttpError(403, '需要管理员权限');

    const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
    const query = Object.fromEntries(url.searchParams);
    const result = await r.handler({ req, res, params, query, body, user });
    if (!r.raw && !res.headersSent) sendJson(res, 200, result ?? { ok: true });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? '服务器内部错误' : e.message });
    else res.end();
  }
});

async function bootstrap() {
  await loadCore();
  // 上次进程退出时仍在运行的任务标记为已中断
  for (const t of store.tasks.filter((t) => t.status === 'running' || t.status === 'queued')) {
    t.status = 'stopped';
    t.error = '服务重启，任务已中断';
    store.tasks.save(t);
  }
  cleanupSessions();
  setInterval(cleanupSessions, 3600e3).unref();

  // 可通过环境变量预置管理员账号
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (ADMIN_USERNAME && ADMIN_PASSWORD && !store.users.find((u) => u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase())) {
    const err = auth.validateUsername(ADMIN_USERNAME) || auth.validatePassword(ADMIN_PASSWORD);
    if (err) console.warn(`[bootstrap] 预置管理员失败：${err}`);
    else {
      store.users.save({
        id: newId(),
        username: ADMIN_USERNAME.trim(),
        passwordHash: await auth.hashPassword(ADMIN_PASSWORD),
        role: 'admin',
        createdAt: Date.now(),
      });
      console.log(`[bootstrap] 已创建管理员账号 ${ADMIN_USERNAME}`);
    }
  }

  server.listen(PORT, HOST, () => {
    const cfg = config();
    console.log(`${cfg.siteName} 已启动：http://localhost:${PORT}`);
    console.log(`数据目录：${DATA_DIR}`);
    if (!cfg.apiBaseUrl) console.log('提示：尚未配置模型 API，可在 .env 中设置 API_BASE_URL / API_KEY / MODELS，或登录管理员账号后在「管理」页面配置。');
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const run of runs.values()) run.controller.abort();
    setTimeout(() => process.exit(0), 300);
  });
}

bootstrap();
