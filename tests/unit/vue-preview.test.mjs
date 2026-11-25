// 单元测试：Vue 单文件组件编译（用本站 vendor 中的 @vue/compiler-sfc）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as compiler from '../../public/vendor/vue/compiler-sfc.esm-browser.min.js';
import { compileSFC, isVueApp } from '../../public/js/vue-preview.js';
import { buildPreview } from '../../public/js/preview.js';
import { vueFiles } from '../../public/js/core/scaffold.js';

test('<script setup> + scoped 样式编译为带 default 导出的模块', () => {
  const src = "<script setup>\nimport { ref } from 'vue'\nconst n = ref(0)\n</script>\n<template><button @click=\"n++\">{{ n }}</button></template>\n<style scoped>button { color: red }</style>\n";
  const { code, warnings } = compileSFC(compiler, 'src/A.vue', src);
  assert.match(code, /export default _sfc_main/);
  assert.match(code, /__scopeId = "data-v-[0-9a-f]{8}"/);
  assert.match(code, /button\[data-v-[0-9a-f]{8}\]/);
  assert.deepEqual(warnings, []);
});

test('选项式组件（没有 script setup）也能编译出 render', () => {
  const { code } = compileSFC(compiler, 'src/B.vue', '<script>\nexport default { data: () => ({ a: 1 }) }\n</script>\n<template><p>{{ a }}</p></template>\n');
  assert.match(code, /_sfc_main\.render = _sfc_render/);
});

test('模板写错时，运行时报出文件名和原因，模块仍可链接', () => {
  const { code } = compileSFC(compiler, 'src/C.vue', '<template><div>{{ oops </div></template>');
  assert.match(code, /src\/C\.vue 编译失败/);
  assert.match(code, /export default \{\}/);
});

test('scss 样式给出提示', () => {
  const { warnings } = compileSFC(compiler, 'src/D.vue', '<template><p/></template><style lang="scss">p{a{color:red}}</style>');
  assert.match(warnings[0], /lang="scss"/);
});

test('预览页面：import map 在模块脚本之前，data: URL 中的单引号被转义', () => {
  assert.ok(isVueApp(vueFiles('x')));
  const files = { 'index.html': '<head></head><script type="module" src="/src/main.js"></script>', 'src/main.js': "import msg from './msg.js'\nconsole.log(msg)\n", 'src/msg.js': "export default 'it\\'s ok'\n" };
  const html = buildPreview(files, 'index.html', { importMap: { imports: { vue: 'data:text/javascript,' } }, vite: true });
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
  const main = decodeURIComponent(html.match(/src="data:text\/javascript;charset=utf-8,([^"]+)"/)[1]);
  assert.match(main, /import\.meta\.env = /);
  const inner = main.match(/from '([^']+)'/)[1];
  assert.ok(!inner.includes("'"), '嵌套的 data: URL 里不能出现未转义的单引号');
});
