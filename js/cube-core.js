/* 魔方核心逻辑：54 面贴模型（U R F D L B 各 9 格，Kociemba 顺序）。
 * 转层置换由几何坐标推导（贴纸位置 + 朝向法向量），保证六面动作一致正确。
 * 纯逻辑模块，不依赖 DOM，可在 Node 中测试。 */
(function (root) {
  'use strict';

  var FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  var SOLVED = (function () {
    var s = '';
    FACES.forEach(function (f) { for (var i = 0; i < 9; i++) s += f; });
    return s;
  })();

  /* 每个面贴：pos = 立方体坐标 (x,y,z ∈ {-1,0,1})，normal = 朝向法向量。
   * 各面行主序（U1..U9 等），与标准展开图一致（U1 在后左，D1 在前左…）。 */
  function faceDefs() {
    var defs = [];
    function add(face, startIndex, points, normal) {
      points.forEach(function (p, i) {
        defs[startIndex + i] = { face: face, pos: p, normal: normal };
      });
    }
    var a = -1, b = 0, c = 1;
    // U: 行 z=-1,0,1；列 x=-1,0,1；y=+1
    add('U', 0, [[a,a,a],[b,a,a],[c,a,a],[a,b,a],[b,b,a],[c,b,a],[a,c,a],[b,c,a],[c,c,a]].map(zy), [0, 1, 0]);
    function zy(p) { return [p[0], 1, p[1]]; } // U 用 [x,z] 存
    // R: 行 y=1,0,-1；列 z=-1,0,1；x=+1
    add('R', 9, [[1,1,-1],[1,1,0],[1,1,1],[1,0,-1],[1,0,0],[1,0,1],[1,-1,-1],[1,-1,0],[1,-1,1]], [1, 0, 0]);
    // F: 行 y=1,0,-1；列 x=-1,0,1；z=+1
    add('F', 18, [[-1,1,1],[0,1,1],[1,1,1],[-1,0,1],[0,0,1],[1,0,1],[-1,-1,1],[0,-1,1],[1,-1,1]], [0, 0, 1]);
    // D: 行 z=1,0,-1；列 x=-1,0,1；y=-1
    add('D', 27, [[-1,-1,1],[0,-1,1],[1,-1,1],[-1,-1,0],[0,-1,0],[1,-1,0],[-1,-1,-1],[0,-1,-1],[1,-1,-1]], [0, -1, 0]);
    // L: 行 y=1,0,-1；列 z=1,0,-1；x=-1
    add('L', 36, [[-1,1,1],[-1,1,0],[-1,1,-1],[-1,0,1],[-1,0,0],[-1,0,-1],[-1,-1,1],[-1,-1,0],[-1,-1,-1]], [-1, 0, 0]);
    // B: 行 y=1,0,-1；列 x=1,0,-1；z=-1
    add('B', 45, [[1,1,-1],[0,1,-1],[-1,1,-1],[1,0,-1],[0,0,-1],[-1,0,-1],[1,-1,-1],[0,-1,-1],[-1,-1,-1]], [0, 0, -1]);
    return defs;
  }
  var DEFS = faceDefs();
  var INDEX_BY_KEY = {};
  DEFS.forEach(function (d, i) {
    INDEX_BY_KEY[key(d.pos, d.normal)] = i;
  });
  function key(pos, normal) { return pos.join(',') + '|' + normal.join(','); }

  // 90° 旋转：绕轴 a 的顺时针（从该面外侧看）= -90°（右手系），
  // 即 v' = v × a + a*(a·v)（a 为单位向量，含与轴平行的分量）
  function cross(u, v) {
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  }
  function dot(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }
  function rotCW(v, a) {
    var c = cross(v, a), d = dot(a, v);
    return [c[0] + a[0] * d, c[1] + a[1] * d, c[2] + a[2] * d];
  }
  var AXIS = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };

  /* 预计算每个基本动作（U/R/F/D/L/B，顺时针 90°）的面贴置换：
   * perm[i] = j 表示新状态第 j 格 = 旧状态第 i 格。 */
  var BASIC_PERM = {};
  FACES.forEach(function (f) {
    var a = AXIS[f];
    var perm = new Array(54);
    DEFS.forEach(function (d, i) {
      if (d.pos[0] * a[0] + d.pos[1] * a[1] + d.pos[2] * a[2] !== 1) { perm[i] = i; return; }
      var np = rotCW(d.pos, a), nn = rotCW(d.normal, a);
      var j = INDEX_BY_KEY[key(np, nn)];
      if (j === undefined) throw new Error('move perm error: face ' + f);
      perm[i] = j;
    });
    BASIC_PERM[f] = perm;
  });

  /* 应用一个动作，如 "R"、"U'"、"F2"；返回新面贴字符串 */
  function applyMove(facelets, move) {
    var m = /^([URFDLB])(2|')?$/.exec(move);
    if (!m) throw new Error('非法动作: ' + move);
    var face = m[1];
    var times = m[2] === '2' ? 2 : m[2] === "'" ? 3 : 1;
    var arr = facelets.split('');
    var perm = BASIC_PERM[face];
    for (var t = 0; t < times; t++) {
      var next = new Array(54);
      for (var i = 0; i < 54; i++) next[perm[i]] = arr[i];
      arr = next;
    }
    return arr.join('');
  }

  function isSolved(facelets) {
    if (typeof facelets !== 'string' || facelets.length !== 54) return false;
    for (var f = 0; f < 6; f++) {
      for (var i = 1; i < 9; i++) {
        if (facelets[f * 9 + i] !== facelets[f * 9]) return false;
      }
    }
    return true;
  }

  /* WCA 风格随机打乱：20 步；相邻不同面，且不出现连续三个同轴动作 */
  var AXIS_OF = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  function scramble(count) {
    var n = count || 20, moves = [];
    while (moves.length < n) {
      var face = FACES[Math.floor(Math.random() * 6)];
      var last = moves[moves.length - 1];
      var second = moves[moves.length - 2];
      if (last && last.face === face) continue;
      if (last && second && AXIS_OF[last.face] === AXIS_OF[face] && AXIS_OF[second.face] === AXIS_OF[last.face]) continue;
      var r = Math.random();
      var suffix = r < 1 / 3 ? "'" : r < 2 / 3 ? '2' : '';
      moves.push({ face: face, suffix: suffix });
    }
    return {
      moves: moves.map(function (m) { return m.face + m.suffix; }),
      text: moves.map(function (m) { return m.face + m.suffix; }).join(' ')
    };
  }

  /* 给 3D 模块用：解析动作 → 轴、层、顺时针 90° 次数 */
  function moveInfo(move) {
    var m = /^([URFDLB])(2|')?$/.exec(move);
    if (!m) throw new Error('非法动作: ' + move);
    var face = m[1];
    var layerAxis = ['U', 'D'].indexOf(face) >= 0 ? 'y' : (['R', 'L'].indexOf(face) >= 0 ? 'x' : 'z');
    var layer = AXIS[face][layerAxis === 'y' ? 1 : layerAxis === 'x' ? 0 : 2];
    var turns = m[2] === '2' ? 2 : m[2] === "'" ? 3 : 1; // 顺时针 90° 的次数
    return { axis: layerAxis, layer: layer, turns: turns };
  }

  var api = {
    FACES: FACES,
    SOLVED: SOLVED,
    applyMove: applyMove,
    isSolved: isSolved,
    scramble: scramble,
    moveInfo: moveInfo,
    DEFS: DEFS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CubeCore = api;
  }
})(typeof self !== 'undefined' ? self : this);
