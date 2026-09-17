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

  t('高阶支持：阶数选择器与 N 阶 API 就绪', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/id="orderSelect"/.test(html), '缺少阶数选择器');
    ['2', '3', '4', '5'].forEach(v => {
      assert.ok(new RegExp('value="' + v + '"').test(html), '缺少 ' + v + ' 阶选项');
    });
    const core = fs.readFileSync(path.join(root, 'js', 'cube-core.js'), 'utf8');
    ['solvedState', 'orderOf', 'dragToMove', 'faceletIndexMap'].forEach(fn =>
      assert.ok(core.includes(fn), 'cube-core 缺少 ' + fn));
    const c3 = fs.readFileSync(path.join(root, 'js', 'cube3d.js'), 'utf8');
    assert.ok(/setOrder/.test(c3) && /faceletIndexMap/.test(c3), 'cube3d 应支持切换阶数');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/orderSelect/.test(app) && /play\.order/.test(app), 'app.js 应接入阶数状态');
  });

  t('转层按钮面板完整（12 个外层动作）', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const moves = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'"];
    moves.forEach(m => {
      const re = new RegExp('data-move="' + m + '"');
      assert.ok(re.test(html), '缺少转层按钮 ' + m);
    });
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/turnPad/.test(app), 'app.js 应绑定转层按钮');
    const c3 = fs.readFileSync(path.join(root, 'js', 'cube3d.js'), 'utf8');
    assert.ok(/cubeGroup\.add\(this\.pivot\)/.test(c3), 'pivot 必须挂在 cubeGroup 下（视角旋转修复）');
  });
};
