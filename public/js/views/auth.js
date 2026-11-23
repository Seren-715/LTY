// 登录 / 注册
import { api, getMode } from '../api.js';
import { esc, $, icon, toast } from '../ui.js';
import { state, loadConfig, navigate } from '../state.js';

export async function authView(container) {
  await loadConfig().catch(() => {});
  const cfg = state.config;
  if (getMode() === 'static') return keyLoginView(container, cfg);
  let mode = cfg.hasUsers ? 'login' : 'register';

  container.innerHTML = `<div class="auth-page"><div class="auth-card">
    <div class="logo">${icon('logo')}</div>
    <h1>${esc(cfg.siteName)}</h1>
    <p class="tagline">你的 AI 代码编写智能体</p>
    <div class="auth-tabs ${cfg.allowRegister ? '' : 'hidden'}">
      <button data-mode="login">登录</button>
      <button data-mode="register">注册</button>
    </div>
    <form novalidate>
      <div class="field"><label for="u">用户名</label><input id="u" class="input" name="username" autocomplete="username" maxlength="32" required></div>
      <div class="field"><label for="p">密码</label><input id="p" class="input" name="password" type="password" autocomplete="current-password" required></div>
      <div class="field confirm"><label for="p2">确认密码</label><input id="p2" class="input" name="password2" type="password" autocomplete="new-password"></div>
      <div class="form-error"></div>
      <button class="btn primary block" type="submit"></button>
    </form>
    <div class="banner info first-hint" style="margin:16px 0 0">${icon('shield')}<span>本站还没有账号，第一个注册的账号将自动成为管理员。</span></div>
  </div></div>`;

  const form = $(container, 'form');
  const errEl = $(container, '.form-error');
  const submit = $(form, 'button[type=submit]');

  const sync = () => {
    container.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $(form, '.confirm').classList.toggle('hidden', mode !== 'register');
    $(form, '#p').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    submit.textContent = mode === 'register' ? '创建账号' : '登录';
    $(container, '.first-hint').classList.toggle('hidden', cfg.hasUsers);
    errEl.textContent = '';
  };
  container.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      sync();
    }),
  );
  sync();
  setTimeout(() => $(form, '#u').focus(), 50);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.username.value.trim();
    const password = form.password.value;
    errEl.textContent = '';
    if (!username || !password) return (errEl.textContent = '请输入用户名和密码');
    if (mode === 'register' && password !== form.password2.value) return (errEl.textContent = '两次输入的密码不一致');
    submit.disabled = true;
    try {
      const r = await api.post(mode === 'register' ? '/api/auth/register' : '/api/auth/login', { username, password });
      state.user = r.user;
      await loadConfig();
      toast(mode === 'register' ? `欢迎，${r.user.username}！` : '登录成功', 'success');
      navigate(r.user.role === 'admin' && !state.config.configured ? '#/admin' : '#/');
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });
}

// 纯静态模式：用 API Key 登录
function keyLoginView(container, cfg) {
  container.innerHTML = `<div class="auth-page"><div class="auth-card">
    <div class="logo">${icon('logo')}</div>
    <h1>${esc(cfg.siteName)}</h1>
    <p class="tagline">你的 AI 代码编写智能体</p>
    <form novalidate>
      <div class="field"><label for="k">API Key</label><input id="k" class="input mono" name="key" type="password" autocomplete="off" placeholder="sk-..." required>
        <span class="hint">${esc(cfg.loginHint || '请输入分配给你的 API Key。')}</span></div>
      <div class="field"><label for="n">昵称（可选）</label><input id="n" class="input" name="nickname" maxlength="32" placeholder="怎么称呼你"></div>
      <div class="form-error"></div>
      <button class="btn primary block" type="submit">登录</button>
    </form>
    <div class="banner info" style="margin:16px 0 0;align-items:flex-start">${icon('shield')}<span>Key 只保存在你自己的浏览器里，不会上传到本站。你的项目和任务也保存在本浏览器中，换设备前请在「账号设置」中导出备份。</span></div>
  </div></div>`;
  const form = $(container, 'form');
  const errEl = $(container, '.form-error');
  const submit = $(form, 'button[type=submit]');
  setTimeout(() => form.key.focus(), 50);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const key = form.key.value.trim();
    if (!key) return (errEl.textContent = '请输入 API Key');
    submit.disabled = true;
    submit.textContent = '正在验证…';
    try {
      const r = await api.post('/api/auth/login', { key, nickname: form.nickname.value.trim() });
      state.user = r.user;
      await loadConfig();
      toast(`欢迎，${r.user.username}！`, 'success');
      navigate('#/');
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      submit.disabled = false;
      submit.textContent = '登录';
    }
  });
}
