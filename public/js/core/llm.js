// OpenAI 兼容的 Chat Completions 客户端（支持流式输出与工具调用，浏览器与 Node 通用）。
// 兼容 OpenAI、DeepSeek、通义千问 DashScope 兼容模式、Moonshot、OpenRouter、各类中转等。

function endpoint(baseUrl, suffix) {
  let u = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) throw new Error('尚未配置 API 地址');
  if (/^https:\/\/api\.tangguo\.xin$/i.test(u)) u += '/v1';
  if (suffix === '/chat/completions') {
    if (/\/chat\/completions$/.test(u)) return u;
    return u + suffix;
  }
  u = u.replace(/\/chat\/completions$/, '');
  return u + suffix;
}

function headers(cfg) {
  const h = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
  if (cfg.apiKey) h.Authorization = `Bearer ${cfg.apiKey}`;
  return h;
}

async function readError(res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  let msg = text;
  try {
    const j = JSON.parse(text);
    msg = j.error?.message || j.message || j.msg || text;
  } catch {
    /* 非 JSON */
  }
  const detail = msg ? '：' + String(msg).slice(0, 600) : '';
  let err;
  if (res.status === 401) err = new Error(`API Key 无效或已被删除${detail}`);
  else if (res.status === 402 || /key limit|credit|insufficient|余额|quota/i.test(String(msg))) {
    err = new Error(`额度已用完，请联系发 Key 给你的人充值${detail}`);
  } else err = new Error(`模型接口返回 ${res.status}${detail}`);
  err.status = res.status;
  return err;
}

function mergeToolCalls(target, deltas) {
  for (const tc of deltas) {
    let i = typeof tc.index === 'number' ? tc.index : tc.id ? target.length : target.length - 1;
    if (i < 0) i = 0;
    const cur = (target[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
    if (tc.id) cur.id = tc.id;
    if (tc.function?.name) {
      // 有些服务每个分片都会带完整名称
      cur.function.name = cur.function.name === tc.function.name ? cur.function.name : cur.function.name + tc.function.name;
    }
    if (tc.function?.arguments) {
      const a = tc.function.arguments;
      cur.function.arguments += typeof a === 'string' ? a : JSON.stringify(a);
    }
  }
}

function finalizeToolCalls(list) {
  return list
    .filter((t) => t && t.function && t.function.name)
    .map((t, i) => ({
      id: t.id || `call_${Date.now().toString(36)}_${i}`,
      type: 'function',
      function: { name: t.function.name, arguments: t.function.arguments || '{}' },
    }));
}

/**
 * 调用 chat/completions。
 * handlers.onDelta(text) / handlers.onReasoning(text) 在流式输出时回调。
 * 返回 { content, reasoning, toolCalls, finishReason, usage }
 */
export async function chat(cfg, body, { signal, onDelta, onReasoning } = {}) {
  const payload = { ...body };
  if (cfg.stream !== false) payload.stream = true;
  // OpenRouter：在返回中附带本次花费
  if (/openrouter\.ai/i.test(cfg.apiBaseUrl || '')) payload.usage = { include: true };
  if (cfg.temperature !== undefined && cfg.temperature !== null && cfg.temperature !== '') {
    payload.temperature = Number(cfg.temperature);
  }

  const res = await fetch(endpoint(cfg.apiBaseUrl, '/chat/completions'), {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw await readError(res);

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) {
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    const m = j.choices?.[0]?.message || {};
    const content = typeof m.content === 'string' ? m.content : '';
    const reasoning = m.reasoning_content || m.reasoning || '';
    if (reasoning && onReasoning) onReasoning(reasoning);
    if (content && onDelta) onDelta(content);
    return {
      content,
      reasoning,
      toolCalls: finalizeToolCalls(m.tool_calls || []),
      finishReason: j.choices?.[0]?.finish_reason || null,
      usage: j.usage || null,
    };
  }

  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  let reasoning = '';
  let finishReason = null;
  let usage = null;
  const toolCalls = [];

  const handleData = (data) => {
    if (data === '[DONE]') return;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      return;
    }
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    if (j.usage) usage = j.usage;
    const choice = j.choices?.[0];
    if (!choice) return;
    const d = choice.delta || choice.message || {};
    const r = d.reasoning_content ?? d.reasoning;
    if (typeof r === 'string' && r) {
      reasoning += r;
      onReasoning && onReasoning(r);
    }
    if (typeof d.content === 'string' && d.content) {
      content += d.content;
      onDelta && onDelta(d.content);
    }
    if (Array.isArray(d.tool_calls)) mergeToolCalls(toolCalls, d.tool_calls);
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  // 用 reader 逐块读取（Safari 不支持对 ReadableStream 使用 for await）
  const reader = res.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) handleData(line.slice(5).trim());
    }
  }
  const rest = buf.trim();
  if (rest.startsWith('data:')) handleData(rest.slice(5).trim());

  return { content, reasoning, toolCalls: finalizeToolCalls(toolCalls), finishReason, usage };
}

export async function listModels(cfg, signal, { toolsOnly = false } = {}) {
  const res = await fetch(endpoint(cfg.apiBaseUrl, '/models'), { headers: headers(cfg), signal });
  if (!res.ok) throw await readError(res);
  const j = await res.json();
  const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : [];
  return arr
    .filter((m) => m && (!toolsOnly || !Array.isArray(m.supported_parameters) || m.supported_parameters.includes('tools')))
    .map((m) => (typeof m === 'string' ? m : m.id || m.name))
    .filter(Boolean)
    .sort();
}

/**
 * 查询当前 Key 的额度（OpenRouter 的 GET /key）。
 * 返回 { label, limit, remaining, usage } ；接口不支持时返回 null。Key 无效时抛出错误。
 */
export async function getKeyInfo(cfg, signal) {
  const url = endpoint(cfg.apiBaseUrl, '/key');
  if (/^https:\/\/api\.tangguo\.xin\/v1\/key$/i.test(url)) return null;
  const res = await fetch(url, { headers: headers(cfg), signal });
  if (res.status === 401 || res.status === 403) throw await readError(res);
  if (!res.ok) return null;
  let j;
  try {
    j = await res.json();
  } catch {
    return null;
  }
  const d = j.data || j;
  if (d.limit === undefined && d.usage === undefined) return null;
  return {
    label: d.label || '',
    limit: d.limit ?? null,
    remaining: d.limit_remaining ?? (d.limit != null ? d.limit - (d.usage || 0) : null),
    usage: d.usage ?? 0,
  };
}
