/* 主应用：视图切换与各模块 UI。业务代码只通过 DataLayer 读写数据。 */
(function () {
  'use strict';

  var dl = new DataLayer(window.localStorage);
  var Cube = window.CubeCore, Stats = window.StatsCore;

  /* ---------------- 公共小工具 ---------------- */
  var toastTimer = null;
  function toast(msg, isErr) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = isErr ? 'show err' : 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 2400);
  }

  /* ---------------- 音效（WebAudio，无外部资源） ---------------- */
  var audioCtx = null;
  function sound(enabled) { return dl.getSettings().sound && enabled !== false; }
  function beep(freq, dur, delay, type, vol) {
    if (!sound(true)) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var t0 = audioCtx.currentTime + (delay || 0);
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* 音频不可用时静默 */ }
  }
  function sndMove() { beep(620, 0.05, 0, 'triangle', 0.08); }
  function sndWin() { [523, 659, 784, 1046].forEach(function (f, i) { beep(f, 0.28, i * 0.13, 'sine', 0.15); }); }
  function sndTick() { beep(880, 0.06, 0, 'square', 0.06); }

  /* ---------------- 视图切换 ---------------- */
  var currentView = 'home';
  function showView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });
    document.querySelectorAll('#mainNav button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    if (name === 'home') renderHome();
    if (name === 'play') enterPlay();
    if (name === 'timer') enterTimer();
    if (name === 'stats') renderStats();
    if (name === 'settings') renderSettings();
  }
  document.getElementById('mainNav').addEventListener('click', function (e) {
    if (e.target.dataset.view) showView(e.target.dataset.view);
  });
  document.getElementById('logoHome').addEventListener('click', function () { showView('home'); });
  document.querySelectorAll('.module-card').forEach(function (c) {
    c.addEventListener('click', function () { showView(c.dataset.view); });
  });

  /* ---------------- 庆祝动画 ---------------- */
  function celebrate() {
    var el = document.getElementById('celebrate');
    el.classList.add('show');
    var colors = ['#7c6cff', '#38d4c3', '#f7d716', '#e8443a', '#2ecc71', '#f28c1c'];
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('div');
      p.className = 'confetti';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      el.appendChild(p);
    }
    sndWin();
    setTimeout(function () {
      el.classList.remove('show');
      el.querySelectorAll('.confetti').forEach(function (c) { c.remove(); });
    }, 2800);
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    var state = dl.getCubeState();
    var btnContinue = document.getElementById('btnContinue');
    var info = document.getElementById('continueInfo');
    if (state && state.facelets) {
      var solved = Cube.isSolved(state.facelets);
      info.textContent = '上次进行到 ' + (state.moves || 0) + ' 步' +
        (state.elapsedMs ? ' · 已用 ' + Stats.formatTime(state.elapsedMs) : '') +
        (solved ? '（已还原）' : '');
      btnContinue.disabled = false;
    } else {
      info.textContent = '没有进行中的对局，先去玩一局吧';
      btnContinue.disabled = true;
    }
    var today = DataLayer.todayStr();
    document.getElementById('homePractice').textContent = dl.getPractice(today);
    var sum = Stats.summarize(dl.getRecords());
    document.getElementById('homeBest').textContent = sum.best ? Stats.formatTime(sum.best.timeMs) : '--';
    document.getElementById('homeCount').textContent = sum.count;
    var ul = document.getElementById('homeRecent');
    ul.innerHTML = '';
    if (!sum.recent.length) {
      ul.innerHTML = '<li><span class="muted">还没有成绩，去计时器练一把吧</span></li>';
    } else {
      sum.recent.forEach(function (r) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="t">' + Stats.formatTime(r.timeMs) + '</span>' +
          '<span class="d">' + fmtDate(r.date) + '</span>';
        ul.appendChild(li);
      });
    }
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  document.getElementById('btnNewGame').addEventListener('click', function () {
    dl.clearCubeState();
    showView('play');
  });
  document.getElementById('btnContinue').addEventListener('click', function () {
    showView('play');
  });

  /* ---------------- 三阶玩法（支持 2~5 阶） ---------------- */
  var cube3d = null;
  var play = { order: 3, facelets: Cube.SOLVED, moves: 0, elapsedBase: 0, runningSince: 0, scrambled: false };
  var playTick = null;

  function playElapsed() {
    return play.elapsedBase + (play.runningSince ? Date.now() - play.runningSince : 0);
  }
  function savePlay() {
    play.elapsedBase = playElapsed();
    play.runningSince = play.runningSince ? Date.now() : 0;
    dl.saveCubeState({
      order: play.order,
      facelets: play.facelets, moves: play.moves,
      elapsedMs: Math.round(play.elapsedBase), scrambled: play.scrambled,
      savedAt: new Date().toISOString()
    });
  }
  function startPlayTimer() { if (!play.runningSince) play.runningSince = Date.now(); }
  function stopPlayTimer() {
    play.elapsedBase = playElapsed();
    play.runningSince = 0;
  }
  function updatePlayHud() {
    document.getElementById('playMoves').textContent = play.moves;
    document.getElementById('playTime').textContent = (playElapsed() / 1000).toFixed(1) + 's';
    document.getElementById('btnSoundQuick').textContent = dl.getSettings().sound ? '🔊 音效' : '🔇 音效';
  }

  function ensureCube3d() {
    if (cube3d) { cube3d._resize(); return true; }
    if (window.__threeFailed || typeof THREE === 'undefined') {
      document.getElementById('threeError').style.display = 'block';
      document.getElementById('cubeCanvas').style.display = 'none';
      return false;
    }
    document.getElementById('threeError').style.display = 'none';
    document.getElementById('cubeCanvas').style.display = 'block';
    try {
      cube3d = new Cube3D(document.getElementById('cubeCanvas'), {
        order: play.order,
        animSpeed: dl.getSettings().animSpeed,
        onUserMove: onUserMove
      });
      window.__cube3d = cube3d; // 调试/测试用句柄
      cube3d.setSensitivity(dl.getSettings().sensitivity);
      cube3d.setFacelets(play.facelets);
    } catch (e) {
      document.getElementById('threeError').style.display = 'block';
      document.getElementById('cubeCanvas').style.display = 'none';
      return false;
    }
    return true;
  }

  function enterPlay() {
    dl.incrementPractice(DataLayer.todayStr());
    var saved = dl.getCubeState();
    var order = 3;
    if (saved && saved.facelets && typeof saved.facelets === 'string' && saved.facelets.length % 6 === 0) {
      order = Math.min(5, Math.max(2, saved.order || Cube.orderOf(saved.facelets) || 3));
      play = {
        order: order,
        facelets: saved.facelets,
        moves: saved.moves || 0,
        elapsedBase: saved.elapsedMs || 0,
        runningSince: 0,
        scrambled: !!saved.scrambled && !Cube.isSolved(saved.facelets)
      };
      play.runningSince = play.scrambled ? Date.now() : 0;
    } else {
      play = { order: play.order, facelets: Cube.solvedState(play.order), moves: 0, elapsedBase: 0, runningSince: 0, scrambled: false };
    }
    document.getElementById('orderSelect').value = String(play.order);
    if (ensureCube3d()) {
      if (cube3d.N !== play.order) cube3d.setOrder(play.order);
      cube3d.setFacelets(play.facelets);
    }
    updatePlayHud();
    clearInterval(playTick);
    playTick = setInterval(updatePlayHud, 500);
  }

  function onUserMove(moveStr) {
    play.facelets = Cube.applyMove(play.facelets, moveStr);
    play.moves += 1;
    if (play.scrambled) startPlayTimer();
    cube3d.setFacelets(play.facelets);
    sndMove();
    updatePlayHud();
    savePlay();
    if (play.scrambled && Cube.isSolved(play.facelets)) {
      play.scrambled = false;
      stopPlayTimer();
      savePlay();
      celebrate();
    }
  }

  // 切换阶数：开一局该阶数的新对局
  document.getElementById('orderSelect').addEventListener('change', function () {
    var N = parseInt(this.value, 10);
    if (!cube3d || cube3d.isBusy()) { // 动画中先回到该阶还原态
      toast('请等待当前动画结束');
    }
    play = { order: N, facelets: Cube.solvedState(N), moves: 0, elapsedBase: 0, runningSince: 0, scrambled: false };
    if (ensureCube3d()) cube3d.setOrder(N);
    updatePlayHud();
    savePlay();
    document.getElementById('playStatus').textContent = N + '×' + N + '×' + N + ' 新对局';
  });

  document.getElementById('btnScramble').addEventListener('click', function () {
    if (!ensureCube3d() || cube3d.isBusy()) return;
    var sc = Cube.scramble(play.order);
    sc.moves.forEach(function (m) { play.facelets = Cube.applyMove(play.facelets, m); });
    play.moves = 0;
    play.elapsedBase = 0;
    play.scrambled = true;
    play.runningSince = 0;
    cube3d.setFacelets(play.facelets);
    cube3d.setAnimSpeed(dl.getSettings().animSpeed);
    sc.moves.forEach(function (m) { cube3d.enqueueMove(m, { silent: true }); });
    updatePlayHud();
    savePlay();
    document.getElementById('playStatus').textContent = '已打乱，开始还原吧！';
  });

  document.getElementById('btnResetCube').addEventListener('click', function () {
    if (cube3d && cube3d.isBusy()) return;
    play = { order: play.order, facelets: Cube.solvedState(play.order), moves: 0, elapsedBase: 0, runningSince: 0, scrambled: false };
    if (cube3d) cube3d.setFacelets(play.facelets);
    stopPlayTimer();
    updatePlayHud();
    savePlay();
    document.getElementById('playStatus').textContent = '已复原。拖动魔方的一层即可转动';
  });

  document.getElementById('btnSoundQuick').addEventListener('click', function () {
    var s = dl.getSettings();
    dl.updateSettings({ sound: !s.sound });
    updatePlayHud();
    toast(dl.getSettings().sound ? '音效已开启' : '音效已关闭');
  });

  // 转层按钮：等同用户动作，写入逻辑状态
  document.getElementById('turnPad').addEventListener('click', function (e) {
    var move = e.target.dataset && e.target.dataset.move;
    if (!move || !cube3d || cube3d.isBusy()) return;
    cube3d.enqueueMove(move, { user: true });
  });

  /* ---------------- 速拧计时器 ---------------- */
  var timer = { state: 'idle', scramble: null, holdStart: 0, startAt: 0, result: null };
  var HOLD_MS = 300; // 防误触：按住不足 300ms 不开表
  var timerTick = null;

  function enterTimer() {
    dl.incrementPractice(DataLayer.todayStr());
    if (!timer.scramble) newScramble();
    renderTimer();
  }
  function newScramble() {
    timer.scramble = Cube.scramble(20);
    timer.state = 'idle';
    timer.result = null;
    document.getElementById('scrambleText').textContent = timer.scramble.text;
    document.getElementById('resultPanel').classList.remove('show');
    renderTimer();
  }
  function renderTimer() {
    var d = document.getElementById('timerDisplay');
    var hint = document.getElementById('timerHint');
    d.className = '';
    if (timer.state === 'idle') {
      d.textContent = '0.00';
      hint.textContent = '按住空格预热，松手开始计时；计时中按空格停止';
    } else if (timer.state === 'holding') {
      d.textContent = '0.00';
      d.className = 'holding';
      hint.textContent = '松手开表…';
    } else if (timer.state === 'running') {
      d.className = 'running';
      hint.textContent = '按空格停止';
    } else if (timer.state === 'result') {
      d.textContent = Stats.formatTime(timer.result.timeMs);
      hint.textContent = '本把完成，可保存或放弃';
    }
  }

  function timerHoldStart() {
    if (timer.state !== 'idle') return;
    timer.state = 'holding';
    timer.holdStart = Date.now();
    renderTimer();
  }
  function timerHoldRelease() {
    if (timer.state !== 'holding') return;
    if (Date.now() - timer.holdStart >= HOLD_MS) {
      timer.state = 'running';
      timer.startAt = Date.now();
      sndTick();
      clearInterval(timerTick);
      timerTick = setInterval(function () {
        document.getElementById('timerDisplay').textContent =
          ((Date.now() - timer.startAt) / 1000).toFixed(2);
      }, 31);
    } else {
      timer.state = 'idle';
    }
    renderTimer();
  }
  function timerStop() {
    if (timer.state !== 'running') return;
    clearInterval(timerTick);
    var ms = Date.now() - timer.startAt;
    timer.result = { timeMs: ms, scramble: timer.scramble.text, date: new Date().toISOString() };
    timer.state = 'result';
    document.getElementById('resultTime').textContent = Stats.formatTime(ms);
    document.getElementById('resultScramble').textContent = timer.scramble.text;
    document.getElementById('resultPanel').classList.add('show');
    renderTimer();
  }

  // 空格键（仅计时器视图生效）
  window.addEventListener('keydown', function (e) {
    if (currentView !== 'timer' || e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    if (timer.state === 'running') timerStop();
    else timerHoldStart();
  });
  window.addEventListener('keyup', function (e) {
    if (currentView !== 'timer' || e.code !== 'Space') return;
    e.preventDefault();
    timerHoldRelease();
  });
  // 鼠标/触摸等价操作：按住大数字区
  var disp = document.getElementById('timerDisplay');
  disp.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (timer.state === 'running') timerStop(); else timerHoldStart();
  });
  disp.addEventListener('pointerup', function () { timerHoldRelease(); });

  document.getElementById('btnNewScramble').addEventListener('click', newScramble);
  document.getElementById('btnGiveUp').addEventListener('click', function () {
    if (timer.state === 'running') { clearInterval(timerTick); }
    timer.state = 'idle'; timer.result = null;
    document.getElementById('resultPanel').classList.remove('show');
    renderTimer();
  });
  document.getElementById('btnSaveResult').addEventListener('click', function () {
    if (!timer.result) return;
    dl.addRecord(timer.result.timeMs, timer.result.scramble, timer.result.date);
    toast('成绩已保存：' + Stats.formatTime(timer.result.timeMs));
    newScramble();
  });
  document.getElementById('btnDiscardResult').addEventListener('click', function () {
    timer.result = null;
    document.getElementById('resultPanel').classList.remove('show');
    timer.state = 'idle';
    renderTimer();
  });

  /* ---------------- 成绩统计 ---------------- */
  function renderStats() {
    var recs = dl.getRecords();
    var sum = Stats.summarize(recs);
    document.getElementById('stBest').textContent = sum.best ? Stats.formatTime(sum.best.timeMs) : '--';
    document.getElementById('stMean').textContent = sum.mean ? Stats.formatTime(sum.mean) : '--';
    document.getElementById('stAo5').textContent = sum.ao5 ? Stats.formatTime(sum.ao5) : '--';
    document.getElementById('stAo12').textContent = sum.ao12 ? Stats.formatTime(sum.ao12) : '--';
    document.getElementById('stCount').textContent = sum.count;

    var ul = document.getElementById('statsList');
    ul.innerHTML = '';
    if (!recs.length) {
      ul.innerHTML = '<li><span class="muted">暂无成绩</span></li>';
    } else {
      recs.slice().reverse().forEach(function (r, i) {
        var li = document.createElement('li');
        li.innerHTML = '<span>#' + (recs.length - i) + ' <b class="t">' + Stats.formatTime(r.timeMs) +
          '</b></span><span class="d" title="' + r.scramble + '">' + fmtDate(r.date) + '</span>';
        ul.appendChild(li);
      });
    }
    drawTrend(sum.trendPoints);
  }

  function drawTrend(points) {
    var canvas = document.getElementById('trendCanvas');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 800, h = canvas.clientHeight || 260;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var pad = { l: 46, r: 16, t: 18, b: 26 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.45)';

    if (!points.length) {
      ctx.fillText('暂无数据', pad.l, h / 2);
      return;
    }
    var vals = points.map(function (p) { return p.timeMs; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max - min < 1) max = min + 1;
    function X(i) { return pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw); }
    function Y(v) { return pad.t + (1 - (v - min) / (max - min)) * ih; }

    // 网格与纵轴
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    for (var g = 0; g <= 4; g++) {
      var gy = pad.t + (g / 4) * ih;
      ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
      var gv = max - (g / 4) * (max - min);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillText(Stats.formatTime(gv), 4, gy + 4);
    }
    // 折线
    var grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    grad.addColorStop(0, 'rgba(124,108,255,.35)');
    grad.addColorStop(1, 'rgba(56,212,195,.05)');
    ctx.beginPath();
    points.forEach(function (p, i) { i ? ctx.lineTo(X(i), Y(p.timeMs)) : ctx.moveTo(X(i), Y(p.timeMs)); });
    ctx.strokeStyle = '#8f7bff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(X(points.length - 1), pad.t + ih); ctx.lineTo(X(0), pad.t + ih); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // 点
    points.forEach(function (p, i) {
      ctx.beginPath(); ctx.arc(X(i), Y(p.timeMs), 3, 0, Math.PI * 2);
      ctx.fillStyle = p.timeMs === min ? '#38d4c3' : '#c9c4ff';
      ctx.fill();
    });
  }

  // 清空成绩（两步确认）
  var clearArmed = false, clearTimer = null;
  document.getElementById('btnClearRecords').addEventListener('click', function () {
    var btn = this;
    if (!clearArmed) {
      clearArmed = true;
      btn.textContent = '再点一次确认清空';
      clearTimer = setTimeout(function () { clearArmed = false; btn.textContent = '清空成绩'; }, 3000);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    btn.textContent = '清空成绩';
    dl.clearRecords();
    toast('成绩已清空');
    renderStats();
  });

  /* ---------------- 设置 ---------------- */
  function renderSettings() {
    var s = dl.getSettings();
    document.getElementById('setSound').checked = !!s.sound;
    document.getElementById('setAnimSpeed').value = s.animSpeed;
    document.getElementById('setSensitivity').value = s.sensitivity;
    var recs = dl.getRecords();
    document.getElementById('dataMeta').textContent =
      '本地数据：' + recs.length + ' 条成绩 · 数据结构 v' + DataLayer.SCHEMA_VERSION;
  }
  document.getElementById('setSound').addEventListener('change', function () {
    dl.updateSettings({ sound: this.checked });
    toast(this.checked ? '音效已开启' : '音效已关闭');
    updatePlayHud();
  });
  document.getElementById('setAnimSpeed').addEventListener('input', function () {
    dl.updateSettings({ animSpeed: parseFloat(this.value) });
    if (cube3d) cube3d.setAnimSpeed(parseFloat(this.value));
  });
  document.getElementById('setSensitivity').addEventListener('input', function () {
    dl.updateSettings({ sensitivity: parseFloat(this.value) });
    if (cube3d) cube3d.setSensitivity(parseFloat(this.value));
  });

  document.getElementById('btnExport').addEventListener('click', function () {
    var text = dl.exportData();
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '3d-rubik-backup-' + DataLayer.todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('已导出备份文件');
  });

  document.getElementById('btnImport').addEventListener('click', function () {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
    if (!window.confirm('导入将覆盖现有全部数据，确定继续？')) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        dl.importData(reader.result);
        toast('导入成功，数据已恢复');
        renderSettings();
      } catch (e) {
        toast(e.message || '导入失败', true);
      }
    };
    reader.onerror = function () { toast('读取文件失败', true); };
    reader.readAsText(file);
  });

  var clearAllArmed = false, clearAllTimer = null;
  document.getElementById('btnClearAll').addEventListener('click', function () {
    var btn = this;
    if (!clearAllArmed) {
      clearAllArmed = true;
      btn.textContent = '再点一次确认清空全部';
      clearAllTimer = setTimeout(function () { clearAllArmed = false; btn.textContent = '清空全部'; }, 3000);
      return;
    }
    clearTimeout(clearAllTimer);
    clearAllArmed = false;
    btn.textContent = '清空全部';
    dl.clearAll();
    play = { order: 3, facelets: Cube.solvedState(3), moves: 0, elapsedBase: 0, runningSince: 0, scrambled: false };
    if (cube3d) cube3d.setFacelets(play.facelets);
    timer.scramble = null;
    toast('已清空全部数据');
    renderSettings();
  });

  /* ---------------- 启动 ---------------- */
  showView('home');
})();
