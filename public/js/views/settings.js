// 账号设置
import { api } from '../api.js';
import { esc, $, icon, toast, formatDate } from '../ui.js';
import { state, navigate } from '../state.js';

export async function settingsView(container) {
  const { user } = await api.get('/api/auth/me');
  container.innerHTML = `<div class="settings">
    <div class="page-head"><h1>账号设置</h1></div>
    <div class="card">
      <h2>账号信息</h2>
      <p class="sub">你的基本信息</p>
      <div class="row" style="gap:14px">
        <div class="avatar" style="width:48px;height:48px;font-size:20px;cursor:default">${esc(user.username[0].toUpperCase())}</div>
        <div class="grow"><div style="font-weight:600;font-size:15px">${esc(user.username)}</div>
          <div class="muted" style="font-size:13px">${user.role === 'admin' ? '管理员' : '普通用户'} · 注册于 ${formatDate(user.createdAt)}</div></div>
        <button class="btn danger" data-act="logout">${icon('logout')}退出登录</button>
      </div>
    </div>
    <form class="card pw">
      <h2>修改密码</h2>
      <p class="sub">修改后，其他设备上的登录会失效</p>
      <div class="field"><label>当前密码</label><input class="input" type="password" name="old" autocomplete="current-password"></div>
      <div class="form-grid">
        <div class="field"><label>新密码</label><input class="input" type="password" name="n1" autocomplete="new-password"></div>
        <div class="field"><label>确认新密码</label><input class="input" type="password" name="n2" autocomplete="new-password"></div>
      </div>
      <button class="btn primary" type="submit">更新密码</button>
    </form>
  </div>`;

  $(container, '[data-act="logout"]').onclick = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    state.user = null;
    navigate('#/login');
  };
  const form = $(container, 'form.pw');
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.n1.value !== form.n2.value) return toast('两次输入的新密码不一致', 'error');
    try {
      await api.post('/api/auth/password', { oldPassword: form.old.value, newPassword: form.n1.value });
      form.reset();
      toast('密码已更新', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}
