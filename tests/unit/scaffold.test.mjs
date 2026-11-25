// 单元测试：Vue / npm 项目补全，以及智能体的文件工具
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vueFiles, completeNodeProject, needsBuild, npmName, isVueProject, ENSURE_DEPS_PATH } from '../../public/js/core/scaffold.js';
import { executeTool } from '../../public/js/core/agent.js';

const pkgOf = (files) => JSON.parse(files['package.json']);

test('Vue 骨架包含运行所需的全部文件和自动安装脚本', () => {
  const files = vueFiles('练习 Demo');
  for (const p of ['package.json', 'vite.config.js', 'index.html', 'src/main.js', 'src/App.vue', ENSURE_DEPS_PATH]) assert.ok(p in files, p);
  const pkg = pkgOf(files);
  assert.equal(pkg.name, 'demo');
  assert.equal(pkg.scripts.predev, `node ${ENSURE_DEPS_PATH}`);
  assert.ok(pkg.dependencies.vue && pkg.devDependencies.vite && pkg.devDependencies['@vitejs/plugin-vue']);
  assert.deepEqual(completeNodeProject(files), {}, '完整骨架不需要再补');
});

test('半成品 Vue 项目：补齐缺失文件和代码里用到的依赖', () => {
  const files = {
    'src/main.js': "import { createApp } from 'vue'\nimport ElementPlus from 'element-plus'\nimport 'element-plus/dist/index.css'\nimport App from './App.vue'\nimport router from '@/router'\ncreateApp(App).use(router).use(ElementPlus).mount('#app')\n",
    'src/App.vue': '<template><router-view /></template>\n',
    'src/router/index.js': "import { createRouter, createWebHistory } from 'vue-router'\nexport default createRouter({ history: createWebHistory(), routes: [] })\n",
    'src/views/Home.vue': '<template><p>hi</p></template>\n<style lang="scss">p { color: red; }</style>\n',
  };
  const fixes = completeNodeProject(files, { name: 'todo' });
  for (const p of ['package.json', 'vite.config.js', 'index.html', ENSURE_DEPS_PATH]) assert.ok(p in fixes, p);
  assert.ok(!('src/main.js' in fixes), '不会覆盖已有的 main.js');
  const pkg = pkgOf(fixes);
  assert.ok(pkg.dependencies['element-plus'] && pkg.dependencies['vue-router']);
  assert.ok(pkg.devDependencies.sass, '用了 scss 要补 sass');
  assert.ok(!pkg.dependencies['@'], '@/ 别名不是依赖');
  assert.deepEqual(completeNodeProject({ ...files, ...fixes }), {}, '第二次检查不应再有改动');
});

test('非 Vue 项目：普通网页不动，npm 项目只加自动安装，坏掉的 package.json 不动', () => {
  assert.deepEqual(completeNodeProject({ 'index.html': '<h1>hi</h1>' }), {});
  const react = completeNodeProject({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { react: '^19.0.0' } }) });
  assert.equal(pkgOf(react).scripts.predev, `node ${ENSURE_DEPS_PATH}`);
  assert.ok(!pkgOf(react).dependencies.vue);
  assert.deepEqual(completeNodeProject({ 'package.json': '{oops', 'src/App.vue': '' }), {});
});

test('项目类型判断与包名', () => {
  assert.ok(isVueProject({ 'src/App.vue': '' }));
  assert.ok(needsBuild({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }) }));
  assert.ok(!needsBuild({ 'index.html': '' }));
  assert.equal(npmName('我的 Vue App!'), 'vue-app');
  assert.equal(npmName('作业'), 'vue-app');
});

test('scaffold_project 工具只创建缺失的文件，并记录变更', () => {
  const project = { name: 'p', files: { 'src/App.vue': '<template>mine</template>\n' } };
  const task = {};
  const r = executeTool('scaffold_project', { template: 'vue' }, { project, task, mode: 'code' });
  assert.ok(r.ok && r.changed);
  assert.equal(project.files['src/App.vue'], '<template>mine</template>\n', '已有文件不被覆盖');
  assert.ok(project.files['package.json'] && task.changes['package.json'].before === null);
  const again = executeTool('scaffold_project', { template: 'vue' }, { project, task, mode: 'code' });
  assert.ok(again.ok && !again.changed);
});

test('edit_file 要求 old_str 唯一', () => {
  const project = { name: 'p', files: { 'a.js': 'x\nx\n' } };
  const r = executeTool('edit_file', { path: 'a.js', old_str: 'x', new_str: 'y' }, { project, task: {}, mode: 'code' });
  assert.equal(r.ok, false);
  assert.match(r.output, /出现了 2 次/);
});
