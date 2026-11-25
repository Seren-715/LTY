// 测试用服务器：静态托管 public/，以及一个模拟的 OpenAI 兼容模型接口
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));

/** 静态托管 public/（相当于纯静态部署） */
export async function startStatic() {
  const server = http.createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(PUBLIC, path));
    if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return { url: await listen(server), close: () => server.close() };
}

export const TEST_KEY = 'sk-test';

const sse = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
const toolCall = (index, id, name, args) => ({ index, id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

/**
 * 模拟模型：
 *  · 消息里有 “vue” → 调用 scaffold_project，再写一个用到 dayjs 的组件
 *  · 消息里有 “报错” → 直接回复（用于测试把预览报错发给智能体）
 *  · 消息里点名 theme-factory → 先 use_skill 读取技能说明，再回复
 *  · 其他 → 查看文件、写 index.html / app.js，然后总结
 */
export async function startMockLLM() {
  const requests = [];
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const authed = req.headers.authorization === `Bearer ${TEST_KEY}`;
      const json = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
      if (req.url.endsWith('/models')) return json(200, { data: [{ id: 'mock-coder' }] });
      if (req.url.endsWith('/key')) {
        if (!authed) return json(401, { error: { message: 'No auth credentials found' } });
        return json(200, { data: { label: 'test', limit: 5, limit_remaining: 4.12, usage: 0.88 } });
      }
      if (!authed) return json(401, { error: { message: 'invalid key' } });
      const body = JSON.parse(raw || '{}');
      requests.push(body);
      if (!body.stream) return json(200, { choices: [{ message: { role: 'assistant', content: '连接成功' } }] });

      const msgs = body.messages;
      const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
      const steps = msgs.slice(lastUser + 1).filter((m) => m.role === 'assistant').length;
      const u = msgs[lastUser]?.content;
      const text = typeof u === 'string' ? u : JSON.stringify(u ?? '');
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const finish = (content) => {
        sse(res, { choices: [{ delta: { content } }] });
        sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
      };
      const tools = (calls) => sse(res, { choices: [{ delta: { tool_calls: calls }, finish_reason: 'tool_calls' }] });

      if (/报错/.test(text)) finish('已根据报错修复。');
      else if (/theme-factory/.test(text)) {
        if (steps === 0) tools([toolCall(0, 's1', 'use_skill', { name: 'theme-factory' })]);
        else finish('已按主题完成。');
      }
      else if (/vue/i.test(text)) {
        if (steps === 0) tools([toolCall(0, 'v1', 'scaffold_project', { template: 'vue' })]);
        else if (steps === 1) {
          const comp = "<script setup>\nimport dayjs from 'dayjs'\nconst today = dayjs().format('YYYY-MM-DD')\n</script>\n\n<template>\n  <p>今天是 {{ today }}</p>\n</template>\n";
          tools([toolCall(0, 'v2', 'write_file', { path: 'src/components/Today.vue', content: comp })]);
        } else finish('Vue 项目已完成。');
      } else if (steps === 0) {
        sse(res, { choices: [{ delta: { content: '先看看项目文件。' } }] });
        tools([toolCall(0, 'c1', 'list_files', {})]);
      } else if (steps === 1) {
        tools([
          toolCall(0, 'c2', 'write_file', { path: 'index.html', content: '<!doctype html>\n<h1>待办事项</h1>\n<script src="app.js"></script>\n' }),
          toolCall(1, 'c3', 'write_file', { path: 'app.js', content: "console.log('ok');\n" }),
        ]);
      } else finish('已完成！');
      res.end('data: [DONE]\n\n');
    });
  });
  return { url: await listen(server), requests, close: () => server.close() };
}
