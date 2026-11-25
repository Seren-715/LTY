// 单元测试：Word / Excel / PowerPoint 文字提取（样例由 tests/fixtures/make-fixtures.py 生成）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractDocText, isDocFile, isLegacyOffice, docxText } from '../../public/js/docs.js';

const load = async (name) => {
  const buf = await readFile(new URL(`../fixtures/${name}`, import.meta.url));
  return { name, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
};

test('Word：段落、列表和表格', async () => {
  const { text, kind } = await extractDocText(await load('sample.docx'));
  assert.equal(kind, 'Word');
  assert.match(text, /^课程设计要求\n请用 Vue 3 实现一个“图书管理”网页/);
  assert.match(text, /支持增删改查/);
  assert.match(text, /评分项 \| 分值\n功能完整 \| 60/);
});

test('Excel：每个工作表转成 CSV，含逗号的单元格加引号', async () => {
  const { text } = await extractDocText(await load('sample.xlsx'));
  assert.match(text, /## 工作表：成绩（3 行）\n姓名,分数,备注\n张三,92,"优秀, 继续保持"\n李四,78\.5/);
  assert.match(text, /## 工作表：统计（1 行）\n平均分,85\.25/);
});

test('PowerPoint：按页提取，带备注', async () => {
  const { text } = await extractDocText(await load('sample.pptx'));
  assert.match(text, /## 第 1 页\n项目汇报\n第一部分：需求分析\n备注：这里讲五分钟/);
  assert.match(text, /## 第 2 页\n总结与展望\n感谢聆听/);
});

test('文件类型判断与 XML 转义', () => {
  assert.ok(isDocFile('作业.PDF') && isDocFile('a.xlsx') && !isDocFile('a.txt'));
  assert.ok(isLegacyOffice('旧.doc') && !isLegacyOffice('新.docx'));
  assert.equal(docxText('<w:p><w:r><w:t>a &amp; b &lt;c&gt;</w:t></w:r></w:p>'), 'a & b <c>');
});

test('损坏的文件给出可读的错误', async () => {
  const bad = { name: 'x.docx', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  await assert.rejects(extractDocText(bad), /不是有效的 Office 文件/);
});
