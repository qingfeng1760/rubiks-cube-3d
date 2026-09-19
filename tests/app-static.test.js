/* 静态验收：A18 数据层隔离 + 资源引用完整性 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');

module.exports = (t) => {
  t('所有资源文件存在', () => {
    ['index.html', 'css/style.css', 'js/data-layer.js', 'js/cube-core.js',
     'js/pattern-core.js', 'js/stats-core.js', 'js/skins.js',
     'js/cube3d.js', 'js/app.js'].forEach(f =>
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
    const order = ['js/data-layer.js', 'js/cube-core.js', 'js/pattern-core.js', 'js/stats-core.js', 'js/skins.js', 'js/cube3d.js', 'js/app.js'];
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

  t('计时器打乱固定 3 阶（scramble 参数语义回归）', () => {
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/Cube\.scramble\(3\)/.test(app), '计时器应调用 Cube.scramble(3)');
    assert.ok(!/Cube\.scramble\(20\)/.test(app), '不得再把 20 当阶数传入 scramble');
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

  t('视角旋转使用屏幕空间四元数轨道（不再用欧拉角累加）', () => {
    const c3 = fs.readFileSync(path.join(root, 'js', 'cube3d.js'), 'utf8');
    assert.ok(/function orbitQuat/.test(c3), '缺少 orbitQuat 纯函数');
    assert.ok(/this\.orientation/.test(c3), '应使用姿态四元数 orientation');
    assert.ok(/orbitQuat\(this\.orientation/.test(c3), '_applyOrbit 应基于 orientation 计算');
    assert.ok(!/cubeGroup\.rotation\.[xy] \+=/.test(c3), '不得再对 cubeGroup 欧拉角做增量累加');
  });

  t('视角按钮完整（左/右/上/下/复位）且已接线', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/id="viewPad"/.test(html), '缺少视角按钮容器 viewPad');
    ['left', 'right', 'up', 'down', 'reset'].forEach(d => {
      assert.ok(new RegExp('data-view-rot="' + d + '"').test(html), '缺少视角按钮 ' + d);
    });
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/getElementById\('viewPad'\)/.test(app), 'app.js 应绑定视角按钮');
    assert.ok(/orbitView/.test(app), 'app.js 应调用 orbitView');
    assert.ok(/resetView/.test(app), 'app.js 应调用 resetView');
    const c3 = fs.readFileSync(path.join(root, 'js', 'cube3d.js'), 'utf8');
    assert.ok(/Cube3D\.prototype\.orbitView/.test(c3), 'cube3d 缺少 orbitView');
    assert.ok(/Cube3D\.prototype\.resetView/.test(c3), 'cube3d 缺少 resetView');
    assert.ok(/this\.resetView\(\)/.test(c3), '切换阶数时应复位视角');
  });

  t('计时器：计时中无法换打乱（newScramble 状态守卫）', () => {
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    const seg = app.slice(app.indexOf('function newScramble'), app.indexOf('function renderTimer'));
    assert.ok(/timer\.state === 'running'/.test(seg), 'newScramble 应拒绝 running 状态');
    assert.ok(/timer\.state === 'holding'/.test(seg), 'newScramble 应拒绝 holding 状态');
    const guardAt = seg.indexOf("if (timer.state === 'running'");
    const resetAt = seg.indexOf('timer.scramble = Cube.scramble');
    assert.ok(guardAt >= 0 && guardAt < resetAt, '守卫必须直接返回，且在改写计时状态之前');
  });

  t('计时器：放弃按钮无条件停表（修复"按下新打乱后无法放弃"）', () => {
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    const seg = app.slice(
      app.indexOf("getElementById('btnGiveUp')"),
      app.indexOf("getElementById('btnSaveResult')")
    );
    assert.ok(/clearInterval\(timerTick\)/.test(seg), '放弃时应清理计时间隔');
    assert.ok(!/if \(timer\.state === 'running'\)\s*\{\s*clearInterval/.test(seg),
      '清理间隔不应再依赖 running 状态（状态错乱时会停不下来）');
  });

  t('计时器：按钮可用态跟随状态（预热/计时中禁用新打乱）', () => {
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    const seg = app.slice(app.indexOf('function renderTimer'), app.indexOf('function timerHoldStart'));
    assert.ok(/btnNewScramble'\)\.disabled/.test(seg), 'renderTimer 应管理新打乱按钮可用态');
    assert.ok(/btnGiveUp'\)\.disabled/.test(seg), 'renderTimer 应管理放弃按钮可用态');
    assert.ok(/timer\.state === 'running' \|\| timer\.state === 'holding'/.test(seg),
      '预热/计时中应禁用新打乱');
  });

  t('图案花样：UI 与接线（菜单按阶过滤，从还原态生成）', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/id="patternSelect"/.test(html), '缺少花样选择器');
    assert.ok(/id="btnPattern"/.test(html), '缺少生成花样按钮');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/Patterns\.build/.test(app), 'app.js 应通过 pattern-core 生成序列');
    assert.ok(/refreshPatternMenu/.test(app), 'app.js 应按阶数刷新花样菜单');
    const menuSeg = app.slice(app.indexOf('function refreshPatternMenu'), app.indexOf("getElementById('btnPattern').addEventListener"));
    assert.ok(/disabled/.test(menuSeg), '无可用花样时应禁用生成按钮');
    const genSeg = app.slice(app.indexOf("getElementById('btnPattern')"), app.indexOf('/* ---------------- 速拧计时器'));
    assert.ok(/scrambled: true/.test(genSeg), '生成花样应视为一次打乱（计时/庆祝语义）');
    assert.ok(/isBusy\(\)/.test(genSeg), '动画中不应生成花样');
    const core = fs.readFileSync(path.join(root, 'js', 'pattern-core.js'), 'utf8');
    assert.ok(/cube-in-cube/.test(core), 'pattern-core 应含立方体套立方体');
  });

  t('外观皮肤：设置页选择器与换色接线', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/id="setSkin"/.test(html), '设置页缺少皮肤选择器');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/Skins\.list/.test(app), 'app.js 应用 Skins.list 填充选择器');
    assert.ok(/Skins\.get/.test(app), 'app.js 应从 skins 模块取配色');
    assert.ok(/updateSettings\(\{ skin:/.test(app), '皮肤选择应写入设置');
    assert.ok(/setColors/.test(app), 'app.js 应调用 cube3d.setColors 换色');
    const c3 = fs.readFileSync(path.join(root, 'js', 'cube3d.js'), 'utf8');
    assert.ok(/Cube3D\.prototype\.setColors/.test(c3), 'cube3d 缺少 setColors');
    assert.ok(/self\.colors\[/.test(c3), '贴纸着色应走实例配色（可换肤，注意 forEach 回调内用 self）');
    assert.ok(!/\bthis\.colors\[/.test(c3), '不得在普通函数回调里用 this.colors（this 非实例）');
    const dl = fs.readFileSync(path.join(root, 'js', 'data-layer.js'), 'utf8');
    assert.ok(/skin: 'classic'/.test(dl), '设置默认值应含 skin: classic');
  });

  t('撤销一步：invertMove + 历史栈 + 基线切换清空历史', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/id="btnUndo"/.test(html), '缺少撤销按钮');
    const core = fs.readFileSync(path.join(root, 'js', 'cube-core.js'), 'utf8');
    assert.ok(/function invertMove/.test(core), 'cube-core 缺少 invertMove');
    assert.ok(/invertMove: invertMove/.test(core), 'invertMove 应导出');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/Cube\.invertMove/.test(app), 'app.js 应调用 invertMove');
    assert.ok(/play\.history\.pop\(\)/.test(app), '撤销应弹出历史栈');
    assert.ok(/function onUserMove\(moveStr, isUndo\)/.test(app), 'onUserMove 应区分撤销');
    assert.ok(/undo: true/.test(app), '撤销动画应带 undo 标记');
    assert.ok(/e\.key !== 'z'/.test(app), '应支持 Ctrl+Z 触发撤销');
    const hudSeg = app.slice(app.indexOf('function updatePlayHud'), app.indexOf('function ensureCube3d'));
    assert.ok(/btnUndo'\)\.disabled/.test(hudSeg), 'updatePlayHud 应管理撤销按钮可用态');
    // 打乱在原对象上清空历史；复原/换阶/花样/清库走新对象字面量
    const scrambleSeg = app.slice(app.indexOf("getElementById('btnScramble')"), app.indexOf("getElementById('btnResetCube')"));
    assert.ok(/history = \[\]/.test(scrambleSeg), '打乱应清空撤销历史');
    // 复原/换阶/花样/清库走新对象字面量（全文件共 5 处：enterPlay 兜底、换阶、复原、花样、清库）
    const count = (app.match(/history: \[\]/g) || []).length;
    assert.ok(count >= 4, '复原/换阶/花样/清库都应重置历史，实测 ' + count + ' 处');
    assert.ok(/history: play\.history/.test(app), '存档应包含历史');
    assert.ok(/Array\.isArray\(saved\.history\)/.test(app), '恢复历史应做类型校验');
    const c3 = fs.readFileSync(path.join(root, 'js', 'cube3d.js'), 'utf8');
    assert.ok(/undo: !!\(opts && opts\.undo\)/.test(c3), 'enqueueMove 应透传 undo 标记');
    assert.ok(/onUserMove\(t\.move, !!t\.undo\)/.test(c3), '_endTurn 应把 undo 传给回调');
  });

  t('键盘转层：仅玩法页生效，输入控件焦点不误触，动画与组合键不触发', () => {
    const core = fs.readFileSync(path.join(root, 'js', 'cube-core.js'), 'utf8');
    assert.ok(/function keyToMove/.test(core), 'cube-core 缺少 keyToMove');
    assert.ok(/keyToMove: keyToMove/.test(core), 'keyToMove 应导出');
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    assert.ok(/Cube\.keyToMove/.test(app), 'app.js 应使用 keyToMove 做键映射');
    const seg = app.slice(
      app.indexOf('/* ---------------- 键盘转层'),
      app.indexOf('/* ---------------- 速拧计时器')
    );
    assert.ok(/addEventListener\('keydown'/.test(seg), '应有玩法页键盘监听');
    assert.ok(/currentView !== 'play'/.test(seg), '监听应限定玩法视图');
    assert.ok(/INPUT|SELECT|TEXTAREA/.test(seg), '输入控件聚焦时不应触发转层');
    assert.ok(/isBusy\(\)/.test(seg), '动画中不应触发键盘转层');
    assert.ok(/e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey/.test(seg), '组合键（Ctrl/Meta/Alt）不应触发转层，避免与撤销冲突');
    assert.ok(/user: true/.test(seg), '键盘转层应走用户动作通道（计步/存档/音效一致）');
  });
};
