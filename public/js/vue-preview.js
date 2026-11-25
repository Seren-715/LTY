// Vue 项目预览：用 Vue 官方的浏览器版编译器（@vue/compiler-sfc）把 .vue 单文件组件编译成 JS，
// 再交给 preview.js 在沙箱 iframe 中运行。vue / vue-router / pinia 使用本站 vendor/ 中的版本，
// 其他第三方包通过 esm.sh 在线加载。编译只在用户自己的浏览器里进行。

const VENDOR = new URL('../vendor/vue/', import.meta.url).href;
const VENDORED = {
  vue: 'vue.esm-browser.prod.js',
  'vue-router': 'vue-router.esm-browser.prod.js',
  pinia: 'pinia.esm-browser.prod.js',
};

/** 是否按 Vue 项目预览：有 .vue 文件，或入口脚本引用了 vue */
export function isVueApp(files) {
  if (Object.keys(files).some((p) => p.endsWith('.vue'))) return true;
  const pkg = safeJson(files['package.json']);
  return !!(pkg?.dependencies?.vue && Object.keys(files).some((p) => /^src\/main\.(js|mjs)$/.test(p)));
}

function safeJson(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const styleInjector = (css, key) =>
  `\n;(function(){var s=document.createElement('style');s.setAttribute('data-vue-file',${JSON.stringify(key)});s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();\n`;

/**
 * 编译一个 .vue 文件为 ES 模块代码（compiler 为 @vue/compiler-sfc 模块）。
 * 返回 { code, warnings }，编译失败时 code 会在运行时抛出带文件名的错误。
 */
export function compileSFC(compiler, path, source) {
  const warnings = [];
  // 保留 default 导出，让模块能正常链接，运行时再抛出带文件名的错误
  const fail = (msg) => ({ code: `throw new Error(${JSON.stringify(`${path} 编译失败：${msg}`)});\nexport default {};\n`, warnings });
  try {
    const { descriptor, errors } = compiler.parse(source, { filename: path, sourceMap: false });
    if (errors.length) return fail(errors.map((e) => e.message || String(e)).join('；'));
    const id = hashId(path);
    const scopeId = `data-v-${id}`;
    const hasScoped = descriptor.styles.some((s) => s.scoped);
    const isTs = [descriptor.script, descriptor.scriptSetup].some((b) => b && /^tsx?$/.test(b.lang || ''));
    if (isTs) warnings.push(`${path} 使用了 TypeScript，预览中只做简单处理，复杂类型写法可能报错`);
    const templateOptions = { id, scoped: hasScoped, slotted: descriptor.slotted, compilerOptions: { scopeId: hasScoped ? scopeId : undefined } };

    let code;
    let bindings;
    if (descriptor.script || descriptor.scriptSetup) {
      const script = compiler.compileScript(descriptor, { id, inlineTemplate: true, genDefaultAs: '_sfc_main', templateOptions, isProd: false });
      code = script.content;
      bindings = script.bindings;
      if (isTs) code = stripTypes(code);
    } else code = 'const _sfc_main = {};\n';

    if (descriptor.template && !descriptor.scriptSetup) {
      const tpl = compiler.compileTemplate({ source: descriptor.template.content, filename: path, ...templateOptions, compilerOptions: { ...templateOptions.compilerOptions, bindingMetadata: bindings } });
      if (tpl.errors.length) return fail(tpl.errors.map((e) => e.message || String(e)).join('；'));
      code += '\n' + tpl.code.replace(/\nexport function render\(/, '\nfunction _sfc_render(') + '\n_sfc_main.render = _sfc_render;\n';
    }
    if (hasScoped) code += `\n_sfc_main.__scopeId = ${JSON.stringify(scopeId)};\n`;
    code += `_sfc_main.__file = ${JSON.stringify(path)};\n`;

    descriptor.styles.forEach((style, i) => {
      if (style.lang && !/^(css|postcss)$/.test(style.lang)) {
        warnings.push(`${path} 的 <style lang="${style.lang}"> 在预览中按普通 CSS 处理（变量、混入等写法不生效），下载后 npm run dev 可看到完整效果`);
      }
      const r = compiler.compileStyle({ source: style.content, filename: path, id: scopeId, scoped: style.scoped });
      code += styleInjector(r.errors.length ? style.content : r.code, `${path}#${i}`);
    });
    code += '\nexport default _sfc_main;\n';
    return { code, warnings };
  } catch (e) {
    return fail(e.message || String(e));
  }
}

// 预览中对 TypeScript 只做最简单的处理：去掉 `: 类型` 和 `as 类型` 等常见写法
function stripTypes(code) {
  return code
    .replace(/^\s*(?:export\s+)?(?:interface|type)\s+\w+[^\n]*?(?:\{[\s\S]*?\n\}|=[^\n]*);?\s*$/gm, '')
    .replace(/\bas\s+(?:const|[A-Z]\w*(?:<[^>]*>)?(?:\[\])?)\b/g, '')
    .replace(/(\(|,\s*)(\w+)\??\s*:\s*[\w.<>[\]| ]+(?=[,)=])/g, '$1$2')
    .replace(/<\w+(?:\[\])?>\(/g, '(');
}

/** 找出代码里用到的第三方包（含子路径） */
function bareSpecifiers(files) {
  const out = new Set();
  const re = /(?:\bimport\s*(?:[\w*{}\s,$]+?\s*from\s*)?|\bexport\s*[\w*{}\s,$]*?\s*from\s*|\bimport\s*\(\s*)['"]([^'"\n]+)['"]/g;
  for (const [p, text] of Object.entries(files)) {
    // 只看会在浏览器里运行的代码：跳过 vite.config.js 等配置文件和 scripts/ 下的 Node 脚本
    if (!/\.(vue|js|mjs)$/.test(p) || typeof text !== 'string' || /^(node_modules|scripts)\//.test(p) || /(^|\/)[\w.-]+\.config\.(js|mjs)$/.test(p)) continue;
    for (const m of text.matchAll(re)) {
      const s = m[1];
      if (!/^(\.|\/|@\/|[a-z][a-z0-9+.-]*:)/i.test(s)) out.add(s);
    }
  }
  return out;
}

const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

let compilerPromise = null;
const vendorCache = new Map();
const loadCompiler = () => (compilerPromise ||= import(VENDOR + 'compiler-sfc.esm-browser.min.js'));
function vendorDataUrl(file) {
  if (!vendorCache.has(file)) {
    vendorCache.set(
      file,
      fetch(VENDOR + file)
        .then((r) => {
          if (!r.ok) throw new Error(`无法加载 ${file}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          let bin = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          return `data:text/javascript;base64,${btoa(bin)}`;
        }),
    );
  }
  return vendorCache.get(file);
}

// 预览没有地址栏，把 vue-router 的 web / hash history 换成内存 history，避免沙箱中修改地址报错
const routerShim = (routerUrl) =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(
    `export * from ${JSON.stringify(routerUrl)};\nimport { createMemoryHistory } from ${JSON.stringify(routerUrl)};\nexport const createWebHistory = (base) => createMemoryHistory(base);\nexport const createWebHashHistory = (base) => createMemoryHistory(base);\n`,
  ).replace(/'/g, '%27')}`;

/**
 * 准备 Vue 项目的预览：编译所有 .vue，生成 import map。
 * 返回 { files, importMap, notes }，files 中 .vue 已替换为编译后的 JS。
 */
export async function prepareVuePreview(files) {
  const compiler = await loadCompiler();
  const out = { ...files };
  const notes = [];
  for (const [p, src] of Object.entries(files)) {
    if (!p.endsWith('.vue')) continue;
    const r = compileSFC(compiler, p, src);
    out[p] = r.code;
    notes.push(...r.warnings);
  }

  const pkg = safeJson(files['package.json']) || {};
  const deps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
  const imports = {};
  const [vueUrl, routerUrl, piniaUrl] = await Promise.all(['vue', 'vue-router', 'pinia'].map((n) => vendorDataUrl(VENDORED[n])));
  imports.vue = vueUrl;
  imports['vue-router'] = routerShim(routerUrl);
  imports.pinia = piniaUrl;
  const online = new Set();
  for (const spec of bareSpecifiers(out)) {
    if (spec in imports || spec.endsWith('.css')) continue;
    const name = pkgName(spec);
    const range = deps[name] && !/^(latest|\*|workspace:|file:|link:)/.test(deps[name]) ? `@${deps[name]}` : '';
    imports[spec] = `https://esm.sh/${name}${range}${spec.slice(name.length)}?external=vue`;
    online.add(name);
  }
  if (online.size) notes.push(`这些依赖从 esm.sh 在线加载：${[...online].join('、')}。如果加载失败，请下载项目后运行 npm run dev`);
  return { files: out, importMap: { imports }, notes, deps };
}
