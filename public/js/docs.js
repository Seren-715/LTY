// 文档附件：在浏览器里提取 PDF / Word / Excel / PowerPoint 的文字，作为文本附件发给智能体
// · docx / xlsx / pptx 本质是 ZIP + XML，用浏览器自带的 DecompressionStream 解压后直接解析，不需要第三方库
// · PDF 用本站 vendor/ 中的 pdf.js（Mozilla，Apache-2.0）按需加载
// 文件内容只在用户自己的浏览器里处理。

export const DOC_EXT = /\.(pdf|docx|xlsx|xlsm|pptx)$/i;
const LEGACY_EXT = /\.(doc|xls|ppt)$/i;
export const DOC_MAX_BYTES = 30 * 1024 * 1024;

export const isDocFile = (name) => DOC_EXT.test(name);
export const isLegacyOffice = (name) => LEGACY_EXT.test(name);

// ───────────── ZIP ─────────────

/** 读取 ZIP 中的文件，返回 { 文件名: Uint8Array }；only 可以只解压需要的文件 */
export async function unzip(buffer, only = () => true) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 找到中央目录结束记录（End of Central Directory）
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 Office 文件（无法解压）');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || !only(name)) continue;
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    if (method === 0) out[name] = data;
    else if (method === 8) out[name] = await inflateRaw(data);
    else throw new Error(`不支持的压缩方式（${method}）`);
  }
  return out;
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压，请换用新版 Chrome / Edge / Firefox / Safari');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const text = (u8) => (u8 ? new TextDecoder().decode(u8) : '');
const unescapeXml = (s) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
    const map = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
    if (map[e.toLowerCase()]) return map[e.toLowerCase()];
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// ───────────── Word ─────────────

export function docxText(xml) {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<w:cr\/>|<\/w:p>|<\/w:tc>|<\/w:tr>|<w:numPr>/g;
  for (const m of xml.matchAll(re)) {
    const tag = m[0];
    if (m[1] !== undefined) out += unescapeXml(m[1]);
    else if (tag === '<w:tab/>') out += '\t';
    else if (tag.startsWith('<w:br') || tag === '<w:cr/>') out += '\n';
    else if (tag === '</w:p>') out += '\n';
    else if (tag === '</w:tc>') out = out.replace(/\n$/, '') + ' | ';
    else if (tag === '</w:tr>') out = out.replace(/ \| $/, '') + '\n';
    else if (tag === '<w:numPr>') out += '• ';
  }
  return tidy(out);
}

async function readDocx(buf) {
  const z = await unzip(buf, (n) => n === 'word/document.xml');
  if (!z['word/document.xml']) throw new Error('没有找到正文（word/document.xml）');
  return docxText(text(z['word/document.xml']));
}

// ───────────── Excel ─────────────

const colIndex = (ref) => {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function sheetRows(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      let v = '';
      if (type === 'inlineStr') v = [...body.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join('');
      else {
        const raw = body.match(/<v>([^<]*)<\/v>/)?.[1] ?? '';
        if (type === 's') v = shared[Number(raw)] ?? '';
        else if (type === 'b') v = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw;
        else v = raw;
      }
      v = unescapeXml(v);
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push('');
      row[idx] = v;
    }
    while (row.length && row[row.length - 1] === '') row.pop();
    rows.push(row);
  }
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
}

async function readXlsx(buf) {
  const z = await unzip(buf, (n) => /^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(n));
  const shared = [...text(z['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''),
  );
  const rels = Object.fromEntries([...text(z['xl/_rels/workbook.xml.rels']).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]));
  const sheets = [...text(z['xl/workbook.xml']).matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: unescapeXml(m[0].match(/name="([^"]*)"/)?.[1] || ''),
    path: 'xl/' + String(rels[m[0].match(/r:id="([^"]+)"/)?.[1]] || '').replace(/^\/?xl\//, ''),
  }));
  const parts = [];
  for (const s of sheets.length ? sheets : Object.keys(z).filter((n) => n.includes('worksheets/')).map((path, i) => ({ name: `Sheet${i + 1}`, path }))) {
    if (!z[s.path]) continue;
    const rows = sheetRows(text(z[s.path]), shared);
    const lines = rows.slice(0, 3000).map((r) => r.map(csvCell).join(','));
    parts.push(`## 工作表：${s.name}（${rows.length} 行）\n${lines.join('\n')}${rows.length > 3000 ? '\n…（行数过多，只保留前 3000 行）' : ''}`);
  }
  return parts.join('\n\n');
}

// ───────────── PowerPoint ─────────────

export function slideText(xml) {
  let out = '';
  for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>|<\/a:p>|<a:br\/>/g)) {
    if (m[1] !== undefined) out += unescapeXml(m[1]);
    else out += '\n';
  }
  return tidy(out);
}

async function readPptx(buf) {
  const z = await unzip(buf, (n) => /^ppt\/(slides|notesSlides)\/\w+\.xml$/.test(n));
  const num = (n) => Number(n.match(/(\d+)\.xml$/)?.[1] || 0);
  const slides = Object.keys(z).filter((n) => n.startsWith('ppt/slides/')).sort((a, b) => num(a) - num(b));
  return slides
    .map((n) => {
      const notes = z[`ppt/notesSlides/notesSlide${num(n)}.xml`];
      const noteText = notes ? slideText(text(notes)).replace(/^\d+$/m, '').trim() : '';
      return `## 第 ${num(n)} 页\n${slideText(text(z[n])) || '（无文字）'}${noteText ? `\n备注：${noteText}` : ''}`;
    })
    .join('\n\n');
}

// ───────────── PDF ─────────────

const PDFJS = new URL('../vendor/pdfjs/', import.meta.url).href;
let pdfjsPromise = null;
async function loadPdfjs() {
  pdfjsPromise ||= import(PDFJS + 'pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    return m;
  });
  return pdfjsPromise;
}

async function readPdf(buf) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, isEvalSupported: false, useSystemFonts: true });
  const doc = await task.promise;
  const pages = [];
  const max = Math.min(doc.numPages, 200);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    let lastY = null;
    const lines = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = '';
      }
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
        lastY = null;
        continue;
      }
      lastY = y;
    }
    if (line) lines.push(line);
    pages.push(`## 第 ${i} 页\n${tidy(lines.join('\n'))}`);
  }
  await (task.destroy?.() ?? doc.destroy?.())?.catch?.(() => {});
  const body = pages.join('\n\n');
  if (!body.replace(/## 第 \d+ 页/g, '').trim()) throw new Error('这个 PDF 里没有可以提取的文字（可能是扫描件或图片），可以截图后作为图片发送');
  return body + (doc.numPages > max ? `\n\n…（共 ${doc.numPages} 页，只提取了前 ${max} 页）` : '');
}

/** 提取文档文字，返回 { text, kind } */
export async function extractDocText(file) {
  if (file.size > DOC_MAX_BYTES) throw new Error(`${file.name} 超过 ${DOC_MAX_BYTES / 1024 / 1024}MB`);
  const buf = await file.arrayBuffer();
  const ext = file.name.split('.').pop().toLowerCase();
  const readers = { pdf: [readPdf, 'PDF'], docx: [readDocx, 'Word'], xlsx: [readXlsx, 'Excel'], xlsm: [readXlsx, 'Excel'], pptx: [readPptx, 'PPT'] };
  const [read, kind] = readers[ext] || [];
  if (!read) throw new Error('不支持的文档格式');
  const body = await read(buf);
  if (!body.trim()) throw new Error(`${file.name} 里没有文字`);
  return { text: body, kind };
}
