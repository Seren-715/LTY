// 后端接口封装

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, url, body) {
  const opts = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('网络连接失败，请检查网络');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 无响应体 */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `请求失败（${res.status}）`);
    err.status = res.status;
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized();
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};

/** 读取 SSE 事件流（基于 fetch，可中止）。返回在流结束时 resolve 的 Promise。 */
export async function streamEvents(url, onEvent, signal) {
  const res = await fetch(url, { headers: { Accept: 'text/event-stream' }, credentials: 'same-origin', signal });
  if (!res.ok) {
    let msg = `连接失败（${res.status}）`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    if (res.status === 401) onUnauthorized();
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      try {
        onEvent(JSON.parse(data));
      } catch (e) {
        console.error(e);
      }
    }
  }
}
