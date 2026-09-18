/* 冒烟自检脚本：仅在「3D魔方.exe --smoke」时由 Rust 在页面加载完成后注入。
 * 覆盖：引擎就绪 / 视图切换 / 转层与打乱动画 / 视角按钮 / 计时器全流程 /
 *      localStorage 读写 / 渲染截图；结果经 IPC 交回 Rust，退出码 0/1。 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
  const R = {};
  const errors = [];
  window.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));

  try {
    // 进入玩法页（3D 实例在此创建）
    document.querySelector('#mainNav button[data-view="play"]').click();
    for (let i = 0; i < 100 && !window.__cube3d; i++) await sleep(100);
    const c3 = window.__cube3d;
    R['3D 引擎就绪'] = !!c3;
    R['未走 Three.js 加载失败分支'] = !window.__threeFailed;
    if (!c3) throw new Error('3D 引擎未就绪');

    // 视图切换
    for (const v of ['timer', 'stats', 'settings', 'home', 'play']) {
      document.querySelector('#mainNav button[data-view="' + v + '"]').click();
      await sleep(80);
      R['视图切换 ' + v] = document.getElementById('view-' + v).classList.contains('active');
    }

    // 转层：点按钮 + 手动泵动画帧（无头/后台时 rAF 可能被节流）
    const moves0 = parseInt(document.getElementById('playMoves').textContent, 10);
    const fl0 = c3.facelets;
    document.querySelector('[data-move="R"]').click();
    for (let i = 0; i < 20 && c3.isBusy(); i++) c3._tick(200);
    await sleep(100);
    R['转层动画完成'] = !c3.isBusy();
    R['步数已累加'] = parseInt(document.getElementById('playMoves').textContent, 10) === moves0 + 1;
    R['贴纸状态已更新'] = c3.facelets !== fl0;

    // 打乱（程序动画队列）
    document.getElementById('btnScramble').click();
    for (let i = 0; i < 60 && c3.isBusy(); i++) c3._tick(200);
    R['打乱完成'] = !c3.isBusy() && document.getElementById('playStatus').textContent.indexOf('已打乱') === 0;

    // 视角按钮与复位
    const q0 = c3.orientation.slice();
    document.querySelector('[data-view-rot="right"]').click();
    R['视角按钮生效'] = JSON.stringify(c3.orientation) !== JSON.stringify(q0);
    document.querySelector('[data-view-rot="reset"]').click();
    R['复位视角'] = JSON.stringify(c3.orientation) === JSON.stringify([0, 0, 0, 1]);

    // 计时器：防误触 / 开表 / 按钮禁用态 / 放弃停表
    document.querySelector('#mainNav button[data-view="timer"]').click();
    await sleep(120);
    const hint = () => document.getElementById('timerHint').textContent;
    const display = () => document.getElementById('timerDisplay').textContent;
    const newBtn = document.getElementById('btnNewScramble');
    const giveBtn = document.getElementById('btnGiveUp');
    const kd = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    const ku = () => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

    kd(); await sleep(80); ku(); await sleep(120);   // 轻点：不开表
    R['防误触：轻点不开表'] = hint().indexOf('按住空格') === 0;
    kd(); await sleep(420); ku(); await sleep(350);  // 长按：开表
    R['长按空格开表'] = hint() === '按空格停止';
    R['计时中「新打乱」被禁用'] = newBtn.disabled === true;
    R['计时中「放弃」可用'] = giveBtn.disabled === false;
    const sc0 = document.getElementById('scrambleText').textContent;
    newBtn.click(); await sleep(120);                // 强制点击禁用按钮：不应生效
    R['计时中强制点「新打乱」无效'] =
      document.getElementById('scrambleText').textContent === sc0 && hint() === '按空格停止';
    giveBtn.click(); await sleep(220);               // 放弃：应立即停表
    R['「放弃」立即停表'] = display() === '0.00' && hint().indexOf('按住空格') === 0;

    // localStorage 读写往返（数据层键，读完恢复原值）
    const KEY = 'rubik.settings.v1';
    const before = window.localStorage.getItem(KEY);
    window.localStorage.setItem(KEY, JSON.stringify({ sound: false, animSpeed: 1.5, sensitivity: 1 }));
    const back = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (before === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, before);
    R['localStorage 读写往返'] = !!back && back.animSpeed === 1.5;

    // 渲染一帧并截图（同任务内 render + toDataURL，保证拿到画面）
    document.querySelector('#mainNav button[data-view="play"]').click();
    await sleep(500);
    try {
      c3._resize();
      c3.renderer.render(c3.scene, c3.camera);
      const url = c3.renderer.domElement.toDataURL('image/png');
      R['渲染截图已生成'] = url.length > 5000;
      await invoke('smoke_shot', { dataUrl: url });
    } catch (e) {
      R['渲染截图已生成'] = false;
      errors.push('截图失败: ' + e);
    }

    R['无 JS 报错'] = errors.length === 0;
    const ok = Object.keys(R).every((k) => R[k] === true);
    await invoke('smoke_report', { ok: ok, json: JSON.stringify({ ok: ok, checks: R, errors: errors }, null, 2) });
  } catch (e) {
    const msg = String((e && e.stack) || e);
    try {
      await invoke('smoke_report', {
        ok: false,
        json: JSON.stringify({ ok: false, checks: R, errors: errors.concat([msg]) }, null, 2)
      });
    } catch (e2) { /* 退出流程中，忽略 */ }
  }
})();