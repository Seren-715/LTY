// npm 项目补全：让智能体生成的 Vue（Vite）项目下载后只需运行 npm run dev
// · VUE_FILES：与 `npm create vue@latest`（JavaScript 版）一致的项目骨架
// · ensure-deps：npm run dev / build 之前自动检查并安装依赖，不用再手动 npm install
// · completeNodeProject：智能体结束时检查项目，补上缺失的文件和依赖声明
// 浏览器与 Node 通用，不依赖任何 DOM / Node API

// 与 create-vue 当前生成的版本保持一致
const VUE_VERSIONS = {
  vue: '^3.5.42',
  vite: '^8.2.2',
  '@vitejs/plugin-vue': '^6.0.8',
};
const NODE_ENGINES = '^20.19.0 || >=22.12.0';

// 常见第三方包的版本（代码里用到却没写进 package.json 时自动补上）
const KNOWN_DEPS = {
  'vue-router': '^5.5.1',
  pinia: '^4.1.0',
  axios: '^1.21.1',
  'element-plus': '^2.14.8',
  '@element-plus/icons-vue': '^2.3.2',
  'ant-design-vue': '^4.2.6',
  'naive-ui': '^2.45.3',
  vant: '^4.10.2',
  echarts: '^6.1.0',
  'vue-echarts': '^8.3.2',
  dayjs: '^1.11.23',
  'lodash-es': '^4.18.1',
  '@vueuse/core': '^15.1.0',
  'vue-i18n': '^11.4.23',
  marked: '^18.3.0',
  three: '^0.187.0',
  'chart.js': '^4.6.2',
  'vue-chartjs': '^5.3.7',
  mockjs: '^1.1.0',
};
const STYLE_DEPS = { scss: ['sass', '^1.108.2'], sass: ['sass', '^1.108.2'], less: ['less', '^4.9.1'], styl: ['stylus', '^0.64.0'], stylus: ['stylus', '^0.64.0'] };

export const ENSURE_DEPS_PATH = 'scripts/ensure-deps.mjs';
const ENSURE_DEPS_CMD = `node ${ENSURE_DEPS_PATH}`;

export const ENSURE_DEPS = `// 运行 npm run dev / npm run build 之前自动执行（package.json 中的 predev / prebuild）
// 第一次运行，或 package.json 里的依赖有变化时，自动执行 npm install，不需要手动安装
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// 检查 Node.js 版本是否满足 package.json 中 engines.node 的要求（支持 ^ ~ >= > 和 ||）
const cmp = (a, b) => {
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  return 0;
};
const ver = (v) => v.replace(/^[v=]/, '').split('.').map((x) => parseInt(x, 10) || 0);
const cur = ver(process.versions.node);
const okPart = (part) =>
  part.trim().split(/\\s+/).filter(Boolean).every((c) => {
    const m = c.match(/^(\\^|~|>=|<=|>|<)?(.+)$/);
    const v = ver(m[2]);
    switch (m[1]) {
      case '^': return cmp(cur, v) >= 0 && cur[0] === v[0];
      case '~': return cmp(cur, v) >= 0 && cur[0] === v[0] && cur[1] === v[1];
      case '>=': return cmp(cur, v) >= 0;
      case '>': return cmp(cur, v) > 0;
      case '<=': return cmp(cur, v) <= 0;
      case '<': return cmp(cur, v) < 0;
      default: return /[x*]/.test(m[2]) || cmp(cur, v) >= 0;
    }
  });
const need = pkg.engines?.node;
if (need && !need.split('||').some(okPart)) {
  console.error(\`\\n当前 Node.js 版本是 \${process.versions.node}，这个项目需要 \${need}。\\n请到 https://nodejs.org 下载安装最新的 LTS 版本后再运行。\\n\`);
  process.exit(1);
}

const hash = createHash('sha1')
  .update(JSON.stringify([pkg.dependencies || {}, pkg.devDependencies || {}]))
  .digest('hex');
const marker = join(root, 'node_modules', '.deps-hash');
const installed = existsSync(marker) && readFileSync(marker, 'utf8').trim() === hash;

if (!installed) {
  console.log('\\n正在自动安装依赖（npm install），第一次可能需要一两分钟，请稍候…\\n');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error('\\n依赖安装失败。请检查网络后重新运行 npm run dev。');
    console.error('如果下载很慢，可以先换成国内镜像：npm config set registry https://registry.npmmirror.com\\n');
    process.exit(r.status || 1);
  }
  writeFileSync(marker, hash);
  console.log('\\n依赖安装完成。\\n');
}
`;

function vuePackageJson(name = 'vue-app') {
  return {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      predev: ENSURE_DEPS_CMD,
      dev: 'vite --open',
      prebuild: ENSURE_DEPS_CMD,
      build: 'vite build',
      preview: 'vite preview --open',
    },
    dependencies: { vue: VUE_VERSIONS.vue },
    devDependencies: { '@vitejs/plugin-vue': VUE_VERSIONS['@vitejs/plugin-vue'], vite: VUE_VERSIONS.vite },
    engines: { node: NODE_ENGINES },
  };
}

const json = (o) => JSON.stringify(o, null, 2) + '\n';

/** 把项目名转成合法的 npm 包名 */
export function npmName(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 60);
  return s || 'vue-app';
}

/** 标准 Vite + Vue 3（JavaScript）项目骨架 */
export function vueFiles(name) {
  return {
    'package.json': json(vuePackageJson(npmName(name))),
    'vite.config.js': `import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
`,
    'jsconfig.json': json({ compilerOptions: { paths: { '@/*': ['./src/*'] } }, exclude: ['node_modules', 'dist'] }),
    'index.html': `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
    'src/main.js': `import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
`,
    'src/App.vue': `<script setup>
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <main class="app">
    <HelloWorld msg="你好，Vue！" />
  </main>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}
</style>
`,
    'src/components/HelloWorld.vue': `<script setup>
import { ref } from 'vue'

defineProps({
  msg: { type: String, required: true },
})

const count = ref(0)
</script>

<template>
  <div class="card">
    <h1>{{ msg }}</h1>
    <p>编辑 <code>src/App.vue</code> 后保存，页面会自动刷新。</p>
    <button type="button" @click="count++">点击次数：{{ count }}</button>
  </div>
</template>

<style scoped>
.card {
  text-align: center;
  padding: 32px 40px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(30, 90, 170, 0.12);
}
h1 {
  margin: 0 0 8px;
  color: #2b7de9;
}
button {
  margin-top: 12px;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  background: #2b7de9;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}
code {
  padding: 2px 6px;
  border-radius: 6px;
  background: #eef5ff;
}
</style>
`,
    'src/assets/main.css': `*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #1f2d3d;
  background: #f5f9ff;
}
`,
    '.gitignore': `node_modules
dist
dist-ssr
*.local
.DS_Store
.vscode/*
!.vscode/extensions.json
npm-debug.log*
`,
    'README.md': `# ${name || 'vue-app'}

Vue 3 + Vite 项目。

## 运行

需要先安装 [Node.js](https://nodejs.org)（20.19 或更高版本）。在项目目录打开命令行，运行：

\`\`\`bash
npm run dev
\`\`\`

第一次运行会自动安装依赖，安装完成后浏览器会自动打开页面。

## 打包

\`\`\`bash
npm run build
\`\`\`

打包结果在 \`dist\` 目录。
`,
    [ENSURE_DEPS_PATH]: ENSURE_DEPS,
  };
}

// ───────────── 检查与补全 ─────────────

const isVueFile = (p) => p.endsWith('.vue');
const SRC_RE = /\.(vue|js|mjs|jsx|ts|tsx)$/;
const NODE_BUILTINS = new Set(['fs', 'path', 'url', 'os', 'crypto', 'child_process', 'http', 'https', 'util', 'events', 'stream', 'buffer', 'process', 'module', 'zlib', 'assert', 'readline', 'net', 'tty']);

function parsePkg(text) {
  try {
    const o = JSON.parse(text);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/** 是否为 Vue 项目 */
export function isVueProject(files) {
  const pkg = files['package.json'] != null ? parsePkg(files['package.json']) : null;
  if (pkg && (pkg.dependencies?.vue || pkg.devDependencies?.vue)) return true;
  return Object.keys(files).some(isVueFile);
}

/** 需要构建才能运行（预览面板无法直接打开）的项目 */
export function needsBuild(files) {
  if (Object.keys(files).some(isVueFile)) return true;
  const pkg = files['package.json'] != null ? parsePkg(files['package.json']) : null;
  return !!(pkg?.scripts?.dev && /vite|vue-cli|webpack|next|nuxt/.test(pkg.scripts.dev));
}

/** 从源码中找出用到的第三方包名 */
function importedPackages(files) {
  const found = new Set();
  const styles = new Set();
  const re = /(?:import\s[^'"]*?from\s*|import\s*\(?\s*|export\s[^'"]*?from\s*|require\s*\(\s*)['"]([^'"\n]+)['"]/g;
  for (const [p, text] of Object.entries(files)) {
    if (!p.startsWith('src/') || !SRC_RE.test(p) || typeof text !== 'string') continue;
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      if (/^(\.|\/|@\/|~|#|node:|virtual:|https?:)/.test(spec)) continue;
      const parts = spec.split('/');
      const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (!name || NODE_BUILTINS.has(name) || /[A-Z\s]/.test(name)) continue;
      found.add(name);
    }
    if (isVueFile(p)) for (const m of text.matchAll(/<style[^>]*\slang=["']?(\w+)/g)) styles.add(m[1]);
    if (/\.(scss|sass)$/.test(p)) styles.add('scss');
    if (/\.less$/.test(p)) styles.add('less');
  }
  return { packages: found, styles };
}

/**
 * 检查项目，返回需要补全或修改的文件 { path: newContent }（不修改传入的 files）。
 * 只补缺失的部分，不会覆盖已有代码：
 *  · Vue 项目：补齐 package.json、vite.config.js、index.html、src/main.js 等骨架文件，补上代码里用到的依赖
 *  · 有 dev 脚本的 npm 项目：加上 predev / prebuild 自动安装依赖
 */
export function completeNodeProject(files, { name } = {}) {
  const out = {};
  const has = (p) => p in files || p in out;
  const vue = isVueProject(files);
  const tpl = vue ? vueFiles(name) : null;

  let pkg = files['package.json'] != null ? parsePkg(files['package.json']) : null;
  if (files['package.json'] != null && !pkg) return out; // package.json 写坏了，不动它，交给智能体修
  if (!pkg && !vue) return out;
  const before = pkg ? JSON.stringify(pkg) : '';
  if (!pkg) pkg = JSON.parse(tpl['package.json']);

  if (vue) {
    const tsMain = has('src/main.ts');
    // 骨架文件
    if (!has('vite.config.js') && !has('vite.config.ts') && !has('vite.config.mjs')) out['vite.config.js'] = tpl['vite.config.js'];
    if (!has('index.html')) out['index.html'] = tsMain ? tpl['index.html'].replace('/src/main.js', '/src/main.ts') : tpl['index.html'];
    if (!has('src/main.js') && !tsMain) {
      out['src/main.js'] = has('src/App.vue')
        ? `import { createApp } from 'vue'\nimport App from './App.vue'\n\ncreateApp(App).mount('#app')\n`
        : tpl['src/main.js'];
      if (!has('src/App.vue')) {
        out['src/App.vue'] = tpl['src/App.vue'];
        if (!has('src/components/HelloWorld.vue')) out['src/components/HelloWorld.vue'] = tpl['src/components/HelloWorld.vue'];
      }
      if (out['src/main.js'] === tpl['src/main.js'] && !has('src/assets/main.css')) out['src/assets/main.css'] = tpl['src/assets/main.css'];
    }
    if (!has('jsconfig.json') && !has('tsconfig.json')) out['jsconfig.json'] = tpl['jsconfig.json'];
    if (!has('.gitignore')) out['.gitignore'] = tpl['.gitignore'];

    // 脚本与依赖
    pkg.type ||= 'module';
    pkg.scripts ||= {};
    if (!pkg.scripts.dev) pkg.scripts.dev = 'vite --open';
    if (!pkg.scripts.build) pkg.scripts.build = 'vite build';
    if (!pkg.scripts.preview) pkg.scripts.preview = 'vite preview --open';
    pkg.dependencies ||= {};
    pkg.devDependencies ||= {};
    const declared = (n) => pkg.dependencies[n] || pkg.devDependencies[n] || pkg.peerDependencies?.[n];
    if (!declared('vue')) pkg.dependencies.vue = VUE_VERSIONS.vue;
    const usesVite = /vite/.test(pkg.scripts.dev) || has('vite.config.js') || has('vite.config.ts') || has('vite.config.mjs');
    if (usesVite) {
      if (!declared('vite')) pkg.devDependencies.vite = VUE_VERSIONS.vite;
      if (!declared('@vitejs/plugin-vue')) pkg.devDependencies['@vitejs/plugin-vue'] = VUE_VERSIONS['@vitejs/plugin-vue'];
      pkg.engines ||= { node: NODE_ENGINES };
    }
    const { packages, styles } = importedPackages({ ...files, ...out });
    for (const n of packages) if (!declared(n)) pkg.dependencies[n] = KNOWN_DEPS[n] || 'latest';
    for (const s of styles) {
      const d = STYLE_DEPS[s];
      if (d && !declared(d[0])) pkg.devDependencies[d[0]] = d[1];
    }
    if (!Object.keys(pkg.devDependencies).length) delete pkg.devDependencies;
  }

  // 自动安装依赖：npm run dev / build 之前先检查
  if (pkg.scripts?.dev) {
    let hook = false;
    for (const [pre, main] of [['predev', 'dev'], ['prebuild', 'build']]) {
      if (!pkg.scripts[main]) continue;
      if (!pkg.scripts[pre]) {
        pkg.scripts[pre] = ENSURE_DEPS_CMD;
        hook = true;
      } else if (pkg.scripts[pre].includes(ENSURE_DEPS_PATH)) hook = true;
    }
    // 让 pre 脚本排在对应脚本前面，方便阅读
    const ordered = {};
    for (const [k, v] of Object.entries(pkg.scripts)) {
      if (/^pre(dev|build)$/.test(k) && pkg.scripts[k.slice(3)]) continue;
      if (pkg.scripts['pre' + k] && /^(dev|build)$/.test(k)) ordered['pre' + k] = pkg.scripts['pre' + k];
      ordered[k] = v;
    }
    pkg.scripts = ordered;
    if (hook && !has(ENSURE_DEPS_PATH)) out[ENSURE_DEPS_PATH] = ENSURE_DEPS;
    const gi = files['.gitignore'];
    if (typeof gi === 'string' && !/^\/?node_modules\/?\s*$/m.test(gi)) out['.gitignore'] = gi.replace(/\n?$/, '\n') + 'node_modules\n';
    else if (!has('.gitignore')) out['.gitignore'] = 'node_modules\ndist\n';
  }

  if (JSON.stringify(pkg) !== before) out['package.json'] = json(pkg);
  return out;
}
