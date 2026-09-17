/* 静态验收：A18 数据层隔离 + 资源引用完整性 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');

module.exports = (t) => {
  t('所有资源文件存在', () => {
    ['index.html', 'css/style.css', 'js/data-layer.js', 'js/cube-core.js',
     'js/stats-core.js', 'js/cube3d.js', 'js/app.js'].forEach(f =>
      assert(fs.existsSync(path.join(root, f)), '缺少 ' + f));
  });

  t('A18 localStorage 只允许在数据读写层（app.js 仅组合根注入一次）', () => {
    ['cube-core.js', 'stats-core.js', 'cube3d.js'].forEach(f => {
      const src = fs.readFileSync(path.join(root, 'js', f), 'utf8');
      assert.ok(!/localStorage/.test(src), f + ' 中不应出现 localStorage');
    });
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    // 允许：new DataLayer(window.localStorage) 一次性注入；禁止：直接读写/序列化
    assert.ok(!/localStorage\.(get|set|remove)Item/.test(app), 'app.js 不得直接操作 localStorage');
    assert.ok(!/JSON\.(parse|stringify)/.test(app), 'app.js 不应自行序列化数据');
    const dl = fs.readFileSync(path.join(root, 'js', 'data-layer.js'), 'utf8');
    assert.ok(/storage|localStorage/.test(dl), '数据层应使用注入的 storage');
  });

  t('index.html 按正确顺序加载全部脚本', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const order = ['js/data-layer.js', 'js/cube-core.js', 'js/stats-core.js', 'js/cube3d.js', 'js/app.js'];
    let last = -1;
    order.forEach(f => {
      const i = html.indexOf(f);
      assert.ok(i > last, 'index.html 缺少或乱序: ' + f);
      last = i;
    });
    assert.ok(/three\.min\.js/.test(html), '缺少 Three.js CDN 引用');
    assert.ok(/onerror/.test(html), 'Three.js 需带加载失败处理');
  });

  t('app.js 只通过 DataLayer 访问数据', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/new DataLayer/.test(src), 'app.js 应实例化 DataLayer');
    assert.ok(!/JSON\.(parse|stringify)/.test(src), 'app.js 不应自行序列化数据');
  });
};
