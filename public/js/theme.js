// 主题管理：浅色（浅蓝 + 白）/ 暗色（酒红 + 黑）/ 跟随系统
import { prefs } from './state.js';
import { icon } from './ui.js';

export const THEME_MODES = ['system', 'light', 'dark'];
const THEME_COLORS = { light: '#2b7de9', dark: '#0c080a' };

const mq = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

let listening = false;

export function getThemeMode() {
  const saved = prefs.get('theme', 'system');
  return THEME_MODES.includes(saved) ? saved : 'system';
}

export function resolveTheme(mode = getThemeMode()) {
  if (mode === 'dark' || mode === 'light') return mode;
  return mq?.matches ? 'dark' : 'light';
}

export function isDarkTheme() {
  return document.documentElement.dataset.theme === 'dark' || resolveTheme() === 'dark';
}

export function applyTheme(mode = getThemeMode()) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolved]);
  return { mode, resolved };
}

export function setThemeMode(mode) {
  const next = THEME_MODES.includes(mode) ? mode : 'system';
  prefs.set('theme', next);
  const detail = applyTheme(next);
  window.dispatchEvent(new CustomEvent('rty:theme-change', { detail }));
  return detail;
}

export function toggleTheme() {
  return setThemeMode(isDarkTheme() ? 'light' : 'dark');
}

export function initTheme() {
  applyTheme();
  if (!listening && mq) {
    listening = true;
    const onChange = () => {
      if (getThemeMode() !== 'system') return;
      const detail = applyTheme('system');
      window.dispatchEvent(new CustomEvent('rty:theme-change', { detail }));
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

/** 同步主题切换按钮的图标、提示与文案 */
export function syncThemeButton(btn, { showLabel = false } = {}) {
  if (!btn) return;
  const dark = isDarkTheme();
  const label = dark ? '切换为浅色模式' : '切换为暗色模式';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(dark));
  btn.innerHTML = showLabel
    ? `${icon(dark ? 'sun' : 'moon')}<span>${dark ? '浅色模式' : '暗色模式'}</span>`
    : icon(dark ? 'sun' : 'moon');
}
