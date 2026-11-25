// 端到端测试：在真实浏览器里以纯静态模式打开网站，模型接口用 tests/helpers 里的模拟服务
// 运行：npm run test:e2e（需要 Playwright：npm i -D playwright && npx playwright install chromium）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { startStatic, startMockLLM, TEST_KEY } from '../helpers/servers.mjs';
import { vueFiles } from '../../public/js/core/scaffold.js';

let playwright;
try {
  playwright = createRequire(import.meta.url)('playwright');
} catch {
  /* 没装 Playwright 时跳过 */
}
const skip = playwright ? false : '未安装 Playwright（npm i -D playwright && npx playwright install chromium）';

let site, llm, browser;
before(async () => {
  if (skip) return;
  [site, llm] = await Promise.all([startStatic(), startMockLLM()]);
  browser = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => {
  await browser?.close();
  site?.close();
  llm?.close();
});

/** 新开一个干净的浏览器上下文并登录，返回 { page, errors } */
async function login() {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, acceptDownloads: true });
  await ctx.route('**/config.js', (r) =>
    r.fulfill({ contentType: 'text/javascript', body: `window.RTY_CONFIG={mode:'static',apiBaseUrl:'${llm.url}/v1',models:['mock-coder']}` }),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url + '/');
  await page.fill('#k', TEST_KEY);
  await page.click('button[type=submit]');
  await page.waitForSelector('.home .composer');
  return { page, errors, ctx };
}

const api = (page, method, path, body) =>
  page.evaluate(
    async ([m, p, b]) => {
      const { api } = await import('/js/api.js');
      return m === 'get' ? api.get(p) : api[m](p, b);
    },
    [method, path, body],
  );

test('登录页：粒子背景、显示 Key 按钮，错误的 Key 会提示', { skip }, async () => {
  const ctx = await browser.newContext();
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.RTY_CONFIG={mode:'static',apiBaseUrl:'${llm.url}/v1'}` }));
  const page = await ctx.newPage();
  await page.goto(site.url + '/');
  await page.waitForSelector('.auth-card .fx-pw-btn');
  assert.equal(await page.locator('.fx-particles').count(), 1);
  await page.fill('#k', 'sk-wrong');
  await page.click('.fx-pw-btn');
  assert.equal(await page.getAttribute('#k', 'type'), 'text');
  await page.click('button[type=submit]');
  await page.waitForSelector('.form-error:not(:empty)');
  await ctx.close();
});

test('发送任务：智能体写文件、显示变更卡片，顶栏菜单可以点击', { skip }, async () => {
  const { page, errors, ctx } = await login();
  await page.fill('.home textarea', '做一个待办事项网页');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.changes-card', { timeout: 15000 });
  assert.match(await page.textContent('.changes-card'), /已修改 2 个文件/);
  assert.equal(await page.locator('.composer.running').count(), 0, '结束后输入框不再显示运行光束');

  // 回归：顶栏「⋯」菜单曾被消息区盖住
  await page.click('.more-btn');
  const item = page.locator('.more-pop [data-act="dl-all"]');
  const box = await item.boundingBox();
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-act]')?.dataset.act, [box.x + box.width / 2, box.y + box.height / 2]);
  assert.equal(hit, 'dl-all');
  const [dl] = await Promise.all([page.waitForEvent('download'), item.click()]);
  // 无头浏览器会把中文文件名报告成 “download”，这里直接检查内容是 ZIP
  const buf = await readFile(await dl.path());
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  assert.ok(buf.includes(Buffer.from('index.html')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Ctrl+K 命令面板：搜索并跳转', { skip }, async () => {
  const { page, errors, ctx } = await login();
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.palette');
  await page.keyboard.type('设置');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#/settings');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('删除项目：卡片上的删除按钮需要确认', { skip }, async () => {
  const { page, errors, ctx } = await login();
  const p = await api(page, 'post', '/api/projects', { name: '要删除的项目', template: 'web' });
  await page.goto(site.url + '/#/projects');
  const card = page.locator(`a.card[href="#/projects/${p.id}"]`);
  await card.hover();
  await card.locator('.card-del').click();
  await page.click('.dialog .btn:not(.danger):not(.primary)'); // 取消
  assert.equal(await card.count(), 1);
  await card.hover();
  await card.locator('.card-del').click();
  await page.click('.dialog .btn.danger');
  await page.waitForFunction((id) => !document.querySelector(`a.card[href="#/projects/${id}"]`), p.id);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('拖入文件夹：首页新建项目并导入文本文件，跳过 node_modules 和二进制', { skip }, async () => {
  const { page, errors, ctx } = await login();
  await page.evaluate(() => {
    const file = (name, content, type = 'text/plain') => ({ isFile: true, isDirectory: false, name, file: (ok) => ok(new File([content], name, { type })) });
    const dir = (name, children) => ({
      isFile: false,
      isDirectory: true,
      name,
      createReader() {
        let done = false;
        return { readEntries: (ok) => ok(done ? [] : ((done = true), children)) };
      },
    });
    const root = dir('拖入的项目', [file('index.html', '<h1>hi</h1>', 'text/html'), dir('src', [file('main.js', 'console.log(1)')]), dir('node_modules', [file('x.js', 'x')]), file('a.bin', 'a\u0000b', 'application/octet-stream')]);
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], items: [{ kind: 'file', webkitGetAsEntry: () => root }], files: [] } });
    document.querySelector('.view-root').dispatchEvent(ev);
  });
  await page.waitForFunction(() => document.querySelector('.proj-pick')?.textContent.includes('拖入的项目'));
  const list = await api(page, 'get', '/api/projects');
  const proj = await api(page, 'get', '/api/projects/' + list.find((x) => x.name === '拖入的项目').id);
  assert.deepEqual(Object.keys(proj.files).sort(), ['index.html', 'src/main.js']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('技能：选择网页主题后，智能体读取 theme-factory 技能说明', { skip }, async () => {
  const { page, errors, ctx } = await login();
  await page.click('.home .plus-btn');
  await page.click('[data-add="theme"]');
  await page.click('[data-theme="ocean-depths"]');
  assert.match(await page.textContent('.att-theme'), /深海/);
  await page.fill('.home textarea', '做一个个人主页');
  const before = llm.requests.length;
  await page.keyboard.press('Enter');
  await page.waitForSelector('.changes-card, .msg.assistant .content', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.thread')?.textContent.includes('已按主题完成'));
  const reqs = llm.requests.slice(before);
  const userMsg = reqs[0].messages.find((m) => m.role === 'user');
  assert.match(JSON.stringify(userMsg.content), /theme-factory 技能中的「Ocean Depths」主题/);
  assert.match(reqs[0].messages[0].content, /- frontend-design（内置）/, '系统提示词里列出技能');
  assert.ok(reqs[0].tools.some((t) => t.function.name === 'use_skill'));
  const toolMsg = reqs[1].messages.find((m) => m.role === 'tool');
  assert.match(toolMsg.content, /#1a2332/, 'use_skill 返回了深海主题的色值');
  assert.match(await page.textContent('.thread'), /使用技能\s*theme-factory/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('预览报错：一键发给智能体修复', { skip }, async () => {
  const { page, errors, ctx } = await login();
  const p = await api(page, 'post', '/api/projects', { name: '有 bug 的页面', template: 'blank' });
  await api(page, 'put', `/api/projects/${p.id}/files`, { files: { 'index.html': '<h1>hi</h1>\n<script>notDefinedFn()</script>\n' } });
  const t = await api(page, 'post', '/api/tasks', { projectId: p.id, prompt: '看看有没有报错', model: 'mock-coder' });
  await page.goto(`${site.url}/#/tasks/${t.id}`);
  await page.waitForFunction(() => document.querySelector('.thread')?.textContent.includes('已根据报错修复'));
  await page.click('[data-panel="preview"]');
  const fix = page.locator('.fix-btn:not(.hidden)');
  await fix.waitFor({ timeout: 10000 });
  assert.match(await fix.textContent(), /让智能体修复（1）/);
  const before = llm.requests.length;
  await fix.click();
  await page.waitForFunction(() => document.querySelectorAll('.msg.user').length === 2);
  await page.waitForFunction(() => document.querySelectorAll('.msg.assistant').length >= 2);
  const sent = JSON.stringify(llm.requests[before].messages.at(-1).content);
  assert.match(sent, /notDefinedFn is not defined/);
  assert.match(sent, /index\.html/);
  // 预览 iframe 里故意制造的报错也会被 Playwright 记到页面上，排除它
  assert.deepEqual(errors.filter((e) => !e.includes('notDefinedFn')), []);
  await ctx.close();
});

test('Vue 项目：生成骨架、自动补全依赖，下载后可直接 npm run dev', { skip }, async () => {
  const { page, errors, ctx } = await login();
  const p = await api(page, 'post', '/api/projects', { name: 'vue-demo', template: 'blank' });
  await page.evaluate((id) => localStorage.setItem('rty:projectId', JSON.stringify(id)), p.id);
  await page.reload();
  await page.waitForSelector('.home .composer');
  await page.fill('.home textarea', '用 Vue 做一个显示日期的页面');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.changes-card', { timeout: 15000 });
  assert.match(await page.textContent('.thread'), /生成项目骨架/);
  assert.match(await page.textContent('.thread'), /已自动补全项目文件/);
  const files = (await api(page, 'get', '/api/projects/' + p.id)).files;
  const pkg = JSON.parse(files['package.json']);
  assert.equal(pkg.dependencies.dayjs?.startsWith('^'), true, '代码里用到的 dayjs 被补进依赖');
  assert.equal(pkg.scripts.predev, 'node scripts/ensure-deps.mjs');
  assert.ok(files['src/components/Today.vue'] && files['vite.config.js']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Vue 预览：在网站里直接运行 .vue、vue-router 和 pinia', { skip }, async () => {
  const { page, errors, ctx } = await login();
  const files = {
    ...vueFiles('vue-preview'),
    'src/main.js': "import { createApp } from 'vue'\nimport { createPinia } from 'pinia'\nimport App from './App.vue'\nimport router from './router'\ncreateApp(App).use(createPinia()).use(router).mount('#app')\n",
    'src/router/index.js': "import { createRouter, createWebHistory } from 'vue-router'\nimport Home from '@/views/Home.vue'\nexport default createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes: [{ path: '/', component: Home }, { path: '/about', component: () => import('../views/About.vue') }] })\n",
    'src/stores/count.js': "import { defineStore } from 'pinia'\nimport { ref } from 'vue'\nexport const useCount = defineStore('count', () => { const n = ref(1); return { n, inc: () => n.value++ } })\n",
    'src/App.vue': '<template><nav><RouterLink to="/">首页</RouterLink><RouterLink to="/about">关于</RouterLink></nav><RouterView /></template>\n',
    'src/views/Home.vue': "<script setup>\nimport { useCount } from '@/stores/count'\nconst c = useCount()\n</script>\n<template><h1 class=\"t\">计数 {{ c.n }}</h1><button @click=\"c.inc\">加一</button></template>\n<style scoped>.t { color: rgb(1, 2, 3) }</style>\n",
    'src/views/About.vue': '<template><h2>关于页面</h2></template>\n',
  };
  const p = await api(page, 'post', '/api/projects', { name: 'vue-preview', template: 'blank' });
  await api(page, 'put', `/api/projects/${p.id}/files`, { files });
  await page.goto(`${site.url}/#/projects/${p.id}`);
  await page.waitForSelector('[data-act="preview"]');
  if (!(await page.$('iframe.preview-frame'))) await page.click('[data-act="preview"]');
  const frame = await (await page.waitForSelector('iframe.preview-frame')).contentFrame();
  await frame.waitForSelector('h1.t', { timeout: 20000 });
  await frame.click('button');
  assert.equal(await frame.textContent('h1'), '计数 2');
  assert.equal(await frame.$eval('h1', (e) => getComputedStyle(e).color), 'rgb(1, 2, 3)', 'scoped 样式生效');
  await frame.click('text=关于');
  await frame.waitForSelector('h2');
  assert.equal(await page.locator('.c-line.error').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('文档附件：PDF / Word / Excel / PPT 在浏览器里提取文字后发给智能体', { skip }, async () => {
  const { page, errors, ctx } = await login();
  const fx = (n) => new URL(`../fixtures/${n}`, import.meta.url).pathname;
  await page.setInputFiles('.home .f-file', [fx('sample-cid.pdf'), fx('sample-office.pdf'), fx('sample.docx'), fx('sample.xlsx'), fx('sample.pptx')]);
  await page.waitForFunction(() => document.querySelectorAll('.att-file').length === 5, null, { timeout: 30000 });
  const chips = await page.$$eval('.att-file .att-size', (e) => e.map((x) => x.textContent));
  assert.ok(chips.filter((c) => c.startsWith('PDF · 已提取文字')).length === 2, chips.join(' / '));
  await page.fill('.home textarea', '根据这些文件看看有没有报错');
  const before = llm.requests.length;
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.thread')?.textContent.includes('已根据报错修复'));
  const sent = llm.requests[before].messages.find((m) => m.role === 'user').content;
  const text = typeof sent === 'string' ? sent : sent.map((p) => p.text || '').join('\n');
  assert.match(text, /实验报告：二分查找/, 'CID 字体 PDF（需要 CMap）');
  assert.match(text, /第二页：结论/);
  assert.match(text, /课程设计要求[\s\S]*图书管理/, 'LibreOffice 导出的 PDF / Word');
  assert.match(text, /张三,92,"优秀, 继续保持"/);
  assert.match(text, /备注：这里讲五分钟/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('文档附件：旧版 .doc 和扫描件给出提示', { skip }, async () => {
  const { page, ctx } = await login();
  await page.setInputFiles('.home .f-file', { name: '旧作业.doc', mimeType: 'application/msword', buffer: Buffer.from('xx') });
  await page.waitForSelector('.toast.error');
  assert.match(await page.textContent('.toast.error'), /另存为 \.docx/);
  assert.equal(await page.locator('.att-file').count(), 0);
  await page.setInputFiles('.home .f-file', new URL('../fixtures/sample-scan.pdf', import.meta.url).pathname);
  await page.waitForFunction(() => [...document.querySelectorAll('.toast.error')].some((t) => t.textContent.includes('扫描件')), null, { timeout: 20000 });
  assert.equal(await page.locator('.att-file').count(), 0);
  await ctx.close();
});
