// 轻量语法高亮（无依赖）：注释 / 字符串 / 数字 / 关键字 / 函数名 / 标签
import { esc } from './ui.js';

const KW = {
  js: 'as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return set static super switch this throw true try type typeof undefined var void while with yield',
  py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield',
  c: 'abstract break bool case catch char class const continue default defer do double else enum extends false final finally float fn for func go if impl import int interface let long loop match mod mut namespace new nil null package private protected pub public return self short static struct super switch this throw true try type typedef unsigned use var void while',
  sh: 'if then else elif fi for while do done case esac in function return export local echo cd exit set unset source',
  sql: 'select from where insert into values update set delete create table drop alter add primary key foreign references index join left right inner outer on group by order having limit offset as and or not null is in like distinct union all exists case when then else end default',
  css: '',
  yaml: 'true false null yes no on off',
};

const ALIAS = {
  js: 'js', jsx: 'js', ts: 'js', tsx: 'js', mjs: 'js', cjs: 'js', javascript: 'js', typescript: 'js', vue: 'html', svelte: 'html',
  json: 'json', jsonc: 'json',
  py: 'py', python: 'py',
  html: 'html', htm: 'html', xml: 'html', svg: 'html',
  css: 'css', scss: 'css', less: 'css', sass: 'css',
  sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
  go: 'c', java: 'c', c: 'c', h: 'c', cpp: 'c', cc: 'c', hpp: 'c', 'c++': 'c', cs: 'c', csharp: 'c', rs: 'c', rust: 'c', php: 'c', kt: 'c', kotlin: 'c', swift: 'c', dart: 'c', scala: 'c',
  sql: 'sql',
  yml: 'yaml', yaml: 'yaml', toml: 'yaml', ini: 'yaml', env: 'yaml',
};

const kwSets = {};
for (const [k, v] of Object.entries(KW)) kwSets[k] = new Set(v.split(' '));

export function langFromPath(path) {
  const name = path.split('/').pop().toLowerCase();
  if (name === 'dockerfile' || name === 'makefile') return 'sh';
  if (name.startsWith('.env')) return 'yaml';
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return ALIAS[ext] ? ext : '';
}

function tokenRegex(lang) {
  const parts = [];
  if (lang === 'js' || lang === 'c') parts.push(String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)`);
  else if (lang === 'css') parts.push(String.raw`(\/\*[\s\S]*?\*\/)`);
  else if (lang === 'py' || lang === 'sh' || lang === 'yaml') parts.push(String.raw`(#[^\n]*)`);
  else if (lang === 'sql') parts.push(String.raw`(--[^\n]*)`);
  else parts.push('(\\u0000NEVER)');
  const str = [String.raw`"(?:\\[\s\S]|[^"\\\n])*"`, String.raw`'(?:\\[\s\S]|[^'\\\n])*'`];
  if (lang === 'js') str.unshift(String.raw`\`(?:\\[\s\S]|[^\`\\])*\``);
  if (lang === 'py') str.unshift(String.raw`"""[\s\S]*?"""`, String.raw`'''[\s\S]*?'''`);
  parts.push(`(${str.join('|')})`);
  parts.push(String.raw`(#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?(?:px|em|rem|vh|vw|ms|s|%|fr|deg)?)`);
  parts.push(lang === 'css' ? String.raw`(-{0,2}[A-Za-z_@][\w-]*)` : String.raw`([A-Za-z_$@][\w$]*)`);
  return new RegExp(parts.join('|'), 'g');
}

function highlightGeneric(code, lang) {
  const re = tokenRegex(lang);
  const kws = kwSets[lang] || new Set();
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m.index > last) out += esc(code.slice(last, m.index));
    const [tok, comment, str, num, word] = m;
    if (comment) out += `<span class="tk-c">${esc(tok)}</span>`;
    else if (str) {
      // JSON 中的键名
      const isKey = lang === 'json' && /^\s*:/.test(code.slice(m.index + tok.length));
      out += `<span class="${isKey ? 'tk-p' : 'tk-s'}">${esc(tok)}</span>`;
    } else if (num) out += `<span class="tk-n">${esc(tok)}</span>`;
    else if (word) {
      const lower = lang === 'sql' ? word.toLowerCase() : word;
      const rest = code.slice(m.index + tok.length);
      if (kws.has(lower) || (lang === 'json' && /^(true|false|null)$/.test(word))) out += `<span class="tk-k">${esc(tok)}</span>`;
      else if (lang === 'css' && /^\s*:/.test(rest) && !/^\s*:[a-z-]+\s*[{,(]/.test(rest)) out += `<span class="tk-p">${esc(tok)}</span>`;
      else if (lang !== 'css' && /^\s*\(/.test(rest)) out += `<span class="tk-f">${esc(tok)}</span>`;
      else out += esc(tok);
    } else out += esc(tok);
    last = m.index + tok.length;
    if (tok.length === 0) re.lastIndex++;
  }
  out += esc(code.slice(last));
  return out;
}

function highlightHtml(code) {
  const re = /(<!--[\s\S]*?-->)|(<\/?)([\w:-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?>)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m.index > last) out += esc(code.slice(last, m.index));
    if (m[1]) out += `<span class="tk-c">${esc(m[1])}</span>`;
    else {
      const attrs = m[4].replace(/([^\s=]+)(\s*=\s*)?("[^"]*"|'[^']*'|[^\s>]+)?/g, (all, name, eq, val) =>
        `\u0001a${name}\u0002${eq || ''}${val ? `\u0001s${val}\u0002` : ''}`,
      );
      const attrHtml = esc(attrs)
        .replace(/\u0001a([\s\S]*?)\u0002/g, '<span class="tk-a">$1</span>')
        .replace(/\u0001s([\s\S]*?)\u0002/g, '<span class="tk-s">$1</span>');
      out += `${esc(m[2])}<span class="tk-t">${esc(m[3])}</span>${attrHtml}${esc(m[0].slice(m[2].length + m[3].length + m[4].length))}`;
    }
    last = m.index + m[0].length;
  }
  out += esc(code.slice(last));
  return out;
}

export function highlight(code, lang) {
  const l = ALIAS[String(lang || '').toLowerCase()];
  if (!code) return '';
  if (code.length > 200000 || !l) return esc(code);
  try {
    if (l === 'html') return highlightHtml(code);
    return highlightGeneric(code, l);
  } catch {
    return esc(code);
  }
}
