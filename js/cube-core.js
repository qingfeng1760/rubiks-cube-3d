/* 魔方核心逻辑：N 阶面贴模型（U R F D L B 各 N² 格，标准展开图顺序）。
 * 坐标用缩放整数：第 i 层坐标 = 2i-(N-1)（N=3 → -2,0,2），旋转用 90° 几何推导。
 * 动作记法："R"（外层）、"2R"（从 R 面起第 2 层）、"R2"（180°）、"R'"（逆时针）。
 * 纯逻辑模块，不依赖 DOM，可在 Node 中测试。 */
(function (root) {
  'use strict';

  var FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  // 面外法向（+轴为正面的面）
  var NORMAL = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  var AXIS_IDX = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
  var DEFAULT_COUNT = { 2: 12, 3: 20, 4: 32, 5: 45 };

  /* ---- 面贴几何（按阶数缓存） ---- */
  var defsCache = {}, indexCache = {};

  function defsFor(N) {
    if (defsCache[N]) return defsCache[N];
    var defs = [];
    var m = N - 1; // 坐标最大值
    function grid(face, rowAxis, rowStart, rowStep, colAxis, colStart, colStep, normal) {
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          var pos = [0, 0, 0];
          pos[AXIS_IDX[face]] = NORMAL[face][AXIS_IDX[face]] * m;
          pos[rowAxis] = rowStart + rowStep * r;
          pos[colAxis] = colStart + colStep * c;
          defs.push({ face: face, pos: pos, normal: normal.slice() });
        }
      }
    }
    grid('U', 2, -m, 2, 0, -m, 2, [0, 1, 0]);   // U：行 z 后→前，列 x 左→右
    grid('R', 1, m, -2, 2, -m, 2, [1, 0, 0]);   // R：行 y 上→下，列 z 后→前
    grid('F', 1, m, -2, 0, -m, 2, [0, 0, 1]);   // F：行 y 上→下，列 x 左→右
    grid('D', 2, m, -2, 0, -m, 2, [0, -1, 0]);  // D：行 z 前→后，列 x 左→右
    grid('L', 1, m, -2, 2, m, -2, [-1, 0, 0]);  // L：行 y 上→下，列 z 前→后
    grid('B', 1, m, -2, 0, m, -2, [0, 0, -1]);  // B：行 y 上→下，列 x 右→左
    defsCache[N] = defs;
    return defs;
  }

  function indexMap(N) {
    if (indexCache[N]) return indexCache[N];
    var map = {};
    defsFor(N).forEach(function (d, i) {
      map[d.pos.join(',') + '|' + d.normal.join(',')] = i;
    });
    indexCache[N] = map;
    return map;
  }

  // 90° 顺时针（从该面外侧看）：v' = v × a + a*(a·v)
  function cross(u, v) {
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  }
  function dot(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }
  function rotCW(v, a) {
    var c = cross(v, a), d = dot(a, v);
    return [c[0] + a[0] * d, c[1] + a[1] * d, c[2] + a[2] * d];
  }

  /* 层置换：perm[i] = j 表示旋转后第 j 格 = 原第 i 格 */
  var permCache = {};
  function layerPerm(N, face, depth) {
    var key = N + '|' + face + depth;
    if (permCache[key]) return permCache[key];
    var a = NORMAL[face];
    var s = a[AXIS_IDX[face]];
    var layerCoord = s * ((N - 1) - 2 * (depth - 1));
    var defs = defsFor(N), map = indexMap(N);
    var perm = new Array(defs.length);
    defs.forEach(function (d, i) {
      if (d.pos[AXIS_IDX[face]] !== layerCoord) { perm[i] = i; return; }
      var j = map[rotCW(d.pos, a).join(',') + '|' + rotCW(d.normal, a).join(',')];
      if (j === undefined) throw new Error('move perm error: ' + key);
      perm[i] = j;
    });
    permCache[key] = perm;
    return perm;
  }

  /* ---- 公开 API ---- */
  function orderOf(facelets) {
    return Math.round(Math.sqrt(facelets.length / 6));
  }

  function solvedState(N) {
    var s = '';
    FACES.forEach(function (f) { for (var i = 0; i < N * N; i++) s += f; });
    return s;
  }

  var SOLVED = solvedState(3);

  /* 解析动作：[深度数字]面[修饰符]，如 "R"、"R'"、"R2"、"2R'" */
  function parseMove(move, N) {
    var m = /^(\d)?([URFDLB])(2|')?$/.exec(move);
    if (!m) throw new Error('非法动作: ' + move);
    var depth = m[1] ? parseInt(m[1], 10) : 1;
    if (depth < 1 || depth > Math.max(1, N - 1)) throw new Error('动作层深超出阶数: ' + move);
    return { face: m[2], depth: depth, suffix: m[3] || '' };
  }

  /* 取逆动作：X ↔ X'，X2 自逆，层深不变（撤销用） */
  function invertMove(move) {
    var p = parseMove(move, 6);
    var inv = p.suffix === '2' ? '2' : p.suffix === "'" ? '' : "'";
    return (p.depth > 1 ? p.depth : '') + p.face + inv;
  }

  /* 应用动作；阶数由 facelets 长度推导 */
  function applyMove(facelets, move) {
    var N = orderOf(facelets);
    var p = parseMove(move, N);
    var times = p.suffix === '2' ? 2 : p.suffix === "'" ? 3 : 1;
    var arr = facelets.split('');
    var perm = layerPerm(N, p.face, p.depth);
    for (var t = 0; t < times; t++) {
      var next = new Array(arr.length);
      for (var i = 0; i < arr.length; i++) next[perm[i]] = arr[i];
      arr = next;
    }
    return arr.join('');
  }

  function isSolved(facelets) {
    if (typeof facelets !== 'string' || facelets.length % 6 !== 0) return false;
    var size = facelets.length / 6;
    for (var f = 0; f < 6; f++) {
      for (var i = 1; i < size; i++) {
        if (facelets[f * size + i] !== facelets[f * size]) return false;
      }
    }
    return true;
  }

  /* WCA 风格随机打乱：避免同层连续、避免同轴同层三连 */
  function scramble(order, count) {
    order = order || 3;
    var depthMax = Math.floor(order / 2);
    var n = count || DEFAULT_COUNT[order] || 20;
    var moves = [];
    function token(face, depth, suffix) { return (depth > 1 ? depth : '') + face + suffix; }
    while (moves.length < n) {
      var face = FACES[Math.floor(Math.random() * 6)];
      var depth = 1 + Math.floor(Math.random() * depthMax);
      var last = moves[moves.length - 1], second = moves[moves.length - 2];
      if (last && last.face === face && last.depth === depth) continue;
      if (last && second && last.depth === depth && second.depth === depth
        && AXIS_IDX[last.face] === AXIS_IDX[face] && AXIS_IDX[second.face] === AXIS_IDX[face]) continue;
      var r = Math.random();
      var suffix = r < 1 / 3 ? "'" : r < 2 / 3 ? '2' : '';
      moves.push({ face: face, depth: depth, suffix: suffix });
    }
    var list = moves.map(function (mv) { return token(mv.face, mv.depth, mv.suffix); });
    return { moves: list, text: list.join(' ') };
  }

  /* 给 3D 模块用：动作 → 轴 / 层坐标 / 顺时针 90° 次数 / 面与层深 */
  function moveInfo(move, N2) {
    var n = N2 || 3;
    var p = parseMove(move, n);
    var a = NORMAL[p.face];
    var s = a[AXIS_IDX[p.face]];
    var axis = AXIS_IDX[p.face] === 1 ? 'y' : AXIS_IDX[p.face] === 0 ? 'x' : 'z';
    var layerCoord = s * ((n - 1) - 2 * (p.depth - 1));
    var turns = p.suffix === '2' ? 2 : p.suffix === "'" ? 3 : 1;
    return { axis: axis, layer: layerCoord, turns: turns, face: p.face, depth: p.depth };
  }

  /* 3D 拖拽 → 动作名：layer 为层坐标，dir 为绕 +轴 的旋转方向 */
  function dragToMove(axis, layer, dir, N) {
    var n = N || 3;
    // 中层记为正轴面的对应层（y→U、x→R、z→F），保证动作记法与轴语义往返一致
    var face;
    if (axis === 'y') face = layer >= 0 ? 'U' : 'D';
    else if (axis === 'x') face = layer >= 0 ? 'R' : 'L';
    else face = layer >= 0 ? 'F' : 'B';
    var sign = face === 'U' || face === 'R' || face === 'F' ? 1 : -1;
    var depth = Math.round(((n - 1) - sign * layer) / 2 + 1);
    var prime = (dir > 0) === (layer >= 0); // +90 绕 +轴：正层与中层为逆时针，负层为顺时针
    return (depth > 1 ? depth : '') + face + (prime ? "'" : '');
  }

  var api = {
    FACES: FACES,
    SOLVED: SOLVED,
    solvedState: solvedState,
    orderOf: orderOf,
    applyMove: applyMove,
    isSolved: isSolved,
    scramble: scramble,
    moveInfo: moveInfo,
    dragToMove: dragToMove,
    parseMove: parseMove,
    invertMove: invertMove,
    DEFS: defsFor(3),
    faceletIndexMap: indexMap
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CubeCore = api;
  }
})(typeof self !== 'undefined' ? self : this);
