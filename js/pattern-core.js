/* 图案花样：从还原态一键生成经典图案的动作序列。
 * 纯数据+构造器模块，不依赖 DOM，可在 Node 中测试。
 * 每个花样标注适用阶数；build(id, N) 对不适用的阶数返回 null。 */
(function (root) {
  'use strict';

  /* 奇数阶棋盘格：三个轴各转所有偶数层深（2,4,…,N-1）180°。
   * N=3 → 2R2 2U2 2F2；N=5 → 2R2 4R2 2U2 4U2 2F2 4F2 */
  function checkerBuild(N) {
    var moves = [];
    ['R', 'U', 'F'].forEach(function (face) {
      for (var d = 2; d <= N - 1; d += 2) moves.push(d + face + '2');
    });
    return moves.length ? moves : null;
  }

  var PATTERNS = [
    { id: 'checker', name: '棋盘格', orders: [3, 5], build: checkerBuild },
    { id: 'stripes-v', name: '竖条纹', orders: [3], seq: ['F2', 'B2', 'L2', 'R2'] },
    { id: 'stripes-h', name: '横条纹', orders: [3], seq: ['U2', 'D2', 'F2', 'B2'] },
    { id: 'cube-in-cube', name: '立方体套立方体', orders: [3],
      seq: "F L F U' R U F2 L2 U' L' B D' B' L2 U".split(' ') }
  ];

  function get(id) {
    for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].id === id) return PATTERNS[i];
    return null;
  }
  function list(N) {
    return PATTERNS
      .filter(function (p) { return p.orders.indexOf(N) !== -1; })
      .map(function (p) { return { id: p.id, name: p.name }; });
  }
  function build(id, N) {
    var p = get(id);
    if (!p || p.orders.indexOf(N) === -1) return null;
    return p.seq ? p.seq.slice() : p.build(N);
  }

  var api = { list: list, get: get, build: build };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Patterns = api;
  }
})(typeof self !== 'undefined' ? self : this);
