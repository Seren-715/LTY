// 全局状态
import { api } from './api.js';

export const state = {
  config: null, // /api/config
  user: null,
  projects: [],
};

export async function loadConfig({ refreshModels = false } = {}) {
  state.config = await api.get(refreshModels ? '/api/config?refreshModels=1' : '/api/config');
  state.user = state.config.user;
  return state.config;
}

export async function loadProjects() {
  state.projects = await api.get('/api/projects');
  return state.projects;
}

const LS = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem('rty:' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('rty:' + k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};
export const prefs = LS;

export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
