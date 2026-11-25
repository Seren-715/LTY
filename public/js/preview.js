// 网页项目预览：把项目内的 CSS / JS / 图片等相对引用内联或转换为 data: URL，
// 在 sandbox iframe（不带 allow-same-origin）中运行，项目代码无法访问本站 Cookie。
import { needsBuild } from './core/scaffold.js';

const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain', md: 'text/plain', xml: 'application/xml',
};

const BOOT = `<script>(function(){
var send=function(level,args){try{parent.postMessage({__preview:1,level:level,text:[].map.call(args,function(a){try{if(a instanceof Error)return a.stack||a.message;return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(' ')},'*')}catch(e){}};
['log','info','warn','error','debug'].forEach(function(l){var o=console[l];console[l]=function(){send(l,arguments);if(o)o.apply(console,arguments)}});
window.addEventListener('error',function(e){send('error',[(e.message||'脚本错误')+(e.lineno?' (第 '+e.lineno+' 行)':'')])});
window.addEventListener('unhandledrejection',function(e){send('error',['未处理的 Promise 拒绝：'+((e.reason&&e.reason.message)||e.reason)])});
function shim(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:shim(),configurable:true})}catch(e2){}}});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('[data-preview-nav]');if(a){e.preventDefault();parent.postMessage({__preview:1,nav:a.getAttribute('data-preview-nav')},'*')}},true);
})();<\/script>`;

const extOf = (p) => (p.includes('.') ? p.split('.').pop().toLowerCase() : '');
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export function htmlEntries(files) {
  return Object.keys(files)
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.split('/').length - b.split('/').length || a.localeCompare(b)));
}

export function buildPreview(files, entry) {
  const resolve = (base, ref) => {
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref.trim())) return null;
    const clean = ref.trim().split('#')[0].split('?')[0];
    const parts = clean.startsWith('/') ? [] : base ? base.split('/') : [];
    for (const seg of clean.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    const p = parts.join('/');
    return p in files ? p : null;
  };

  const cache = new Map();
  const visiting = new Set();

  const rewriteJs = (code, base) =>
    code.replace(
      /(\bimport\s*(?:[\w*{}\s,$]+?\s*from\s*)?|\bexport\s*[\w*{}\s,$]*?\s*from\s*|\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g,
      (m, pre, q, spec) => {
        const r = resolve(base, spec);
        return r ? pre + q + dataUrl(r) + q : m;
      },
    );

  const rewriteCss = (code, base) =>
    code
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
        const r = resolve(base, ref);
        return r ? `url("${dataUrl(r)}")` : m;
      })
      .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, ref) => {
        const r = resolve(base, ref);
        return r ? `@import url("${dataUrl(r)}")` : m;
      });

  function dataUrl(path) {
    if (cache.has(path)) return cache.get(path);
    if (visiting.has(path)) return 'data:,';
    visiting.add(path);
    const ext = extOf(path);
    let content = files[path];
    if (ext === 'js' || ext === 'mjs') content = rewriteJs(content, dirOf(path));
    else if (ext === 'css') content = rewriteCss(content, dirOf(path));
    const url = `data:${MIME[ext] || 'text/plain'};charset=utf-8,${encodeURIComponent(content)}`;
    visiting.delete(path);
    cache.set(path, url);
    return url;
  }

  const base = dirOf(entry);
  let html = files[entry] ?? '';

  // 样式表 → 内联 <style>
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const m = tag.match(/href\s*=\s*(["'])([^"']+)\1/i);
    const r = m && resolve(base, m[2]);
    if (!r) return tag;
    return `<style data-src="${r}">\n${rewriteCss(files[r], dirOf(r)).replace(/<\/style/gi, '<\\/style')}\n</style>`;
  });

  // 外部脚本 → 内联（模块脚本改为 data: URL 以支持 import）
  html = html.replace(/<script\b([^>]*)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi, (tag, a1, q, src, a2) => {
    const r = resolve(base, src);
    if (!r) return tag;
    const attrs = (a1 + a2).replace(/\s+/g, ' ');
    if (/type\s*=\s*["']?module/i.test(attrs)) return `<script${attrs} src="${dataUrl(r)}"></script>`;
    return `<script${attrs} data-src="${r}">\n${files[r].replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });

  // 内联模块脚本中的相对 import
  html = html.replace(/(<script\b[^>]*type\s*=\s*["']?module["']?[^>]*>)([\s\S]*?)(<\/script>)/gi, (all, open, body, close) =>
    /\bsrc\s*=/.test(open) ? all : open + rewriteJs(body, base) + close,
  );

  // 内联 <style> 中的 url()
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (all, open, body, close) =>
    /data-src=/.test(open) ? all : open + rewriteCss(body, base) + close,
  );

  // 其余资源引用：页面跳转交给父窗口处理，其他文件转为 data: URL
  html = html.replace(/(\s(?:src|href|poster|data)\s*=\s*)(["'])([^"']+)\2/gi, (m, pre, q, ref) => {
    const r = resolve(base, ref);
    if (!r) return m;
    if (/\.html?$/i.test(r)) return `${pre}${q}#${q} data-preview-nav=${q}${r}${q}`;
    return `${pre}${q}${dataUrl(r)}${q}`;
  });

  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (h) => h + BOOT);
  else if (/<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, (h) => h + BOOT);
  else html = BOOT + html;
  return html;
}

/** 将预览挂到容器中，返回 { refresh(files), destroy() } */
export function mountPreview(container, { getFiles, onLog }) {
  container.innerHTML = '';
  const frame = document.createElement('iframe');
  frame.className = 'preview-frame';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
  frame.setAttribute('title', '预览');
  container.appendChild(frame);
  let entry = null;

  const render = () => {
    const files = getFiles();
    const entries = htmlEntries(files);
    if (!entry || !(entry in files)) entry = entries[0] || null;
    if (!entry) {
      frame.srcdoc = `<body style="font:14px system-ui;color:#5f6f86;display:grid;place-items:center;height:90vh;margin:0">项目中没有 HTML 文件，无法预览。<br>让智能体创建一个 index.html 试试。</body>`;
      return;
    }
    if (entry === 'index.html' && needsBuild(files)) {
      frame.srcdoc = `<body style="font:14px/1.8 system-ui;color:#475a73;display:grid;place-items:center;height:90vh;margin:0;text-align:center;padding:0 20px">
        <div><div style="font-size:34px">📦</div><b style="color:#0f1e33;font-size:15px">这是需要构建的 npm 项目（如 Vue）</b><br>预览面板无法直接运行。请点「下载项目 ZIP」，解压后在项目目录打开命令行运行<br>
        <code style="display:inline-block;margin-top:6px;padding:4px 12px;border-radius:8px;background:#eef5ff;color:#2272dc;font-size:14px">npm run dev</code><br>
        <span style="color:#5f6f86;font-size:12.5px">第一次运行会自动安装依赖，完成后自动打开浏览器</span></div></body>`;
      return;
    }
    frame.srcdoc = buildPreview(files, entry);
  };

  const onMessage = (e) => {
    if (e.source !== frame.contentWindow || !e.data || !e.data.__preview) return;
    if (e.data.nav) {
      entry = e.data.nav;
      render();
      onLog && onLog({ level: 'info', text: `→ 打开 ${entry}` });
      api.onEntry && api.onEntry(entry);
      return;
    }
    onLog && onLog({ level: e.data.level, text: e.data.text });
  };
  window.addEventListener('message', onMessage);

  const api = {
    refresh: render,
    setEntry(p) {
      entry = p;
      render();
    },
    get entry() {
      return entry;
    },
    onEntry: null,
    destroy() {
      window.removeEventListener('message', onMessage);
      frame.remove();
    },
  };
  render();
  return api;
}
