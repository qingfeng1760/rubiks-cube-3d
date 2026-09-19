/* 图案花样测试：序列合法、性质成立、可逆还原、阶数适用 */
'use strict';
const assert = require('assert');
const Cube = require('../js/cube-core.js');
const Patterns = require('../js/pattern-core.js');

const OPP = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const FACES = 'URFDLB';

function applySeq(seq, N, from) {
  let s = from || Cube.solvedState(N);
  for (const m of seq) s = Cube.applyMove(s, m);
  return s;
}
function cell(fb, N, face, r, c) { return fb[FACES.indexOf(face) * N * N + r * N + c]; }

function isCheckerboard(fb, N, face) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const expect = ((r + c) % 2 === 0) ? face : OPP[face];
    if (cell(fb, N, face, r, c) !== expect) return false;
  }
  return true;
}

module.exports = (t) => {
  t('花样清单与阶数适用过滤', () => {
    const ids3 = Patterns.list(3).map(p => p.id);
    assert.ok(ids3.includes('checker') && ids3.includes('stripes-v')
      && ids3.includes('stripes-h') && ids3.includes('cube-in-cube'), '3 阶应含全部四个花样');
    const ids5 = Patterns.list(5).map(p => p.id);
    assert.deepStrictEqual(ids5, ['checker'], '5 阶只有棋盘格');
    assert.deepStrictEqual(Patterns.list(2), [], '2 阶暂无花样');
    assert.strictEqual(Patterns.get('nope'), null, '未知 id 返回 null');
    assert.strictEqual(Patterns.build('checker', 4), null, '不适用阶数返回 null');
    Patterns.list(3).forEach(p => assert.ok(p.name && p.id));
  });

  t('通用性质：序列可解析、非还原态、逆序可还原', () => {
    const inv = m => (m.endsWith('2') ? m : m.endsWith("'") ? m[0] : m[0] + "'"); // 自含取逆（不动作用记法仅三种后缀）
    const all = [['checker', 3], ['checker', 5], ['stripes-v', 3], ['stripes-h', 3], ['cube-in-cube', 3]];
    for (const [id, N] of all) {
      const moves = Patterns.build(id, N);
      assert.ok(Array.isArray(moves) && moves.length > 0, id + ' 应有序列');
      for (const m of moves) assert.doesNotThrow(() => Cube.parseMove(m, N), id + ' 含非法动作 ' + m);
      const st = applySeq(moves, N);
      assert.strictEqual(st.length, 6 * N * N);
      assert.ok(!Cube.isSolved(st), id + ' 生成后不应是还原态');
      assert.ok(Cube.isSolved(applySeq(moves.slice().reverse().map(inv), N, st)), id + ' 逆序取效应还原');
    }
  });

  t('棋盘格：3/5 阶六面均为己色/对色交替', () => {
    for (const N of [3, 5]) {
      const st = applySeq(Patterns.build('checker', N), N);
      for (const f of FACES) assert.ok(isCheckerboard(st, N, f), N + ' 阶 ' + f + ' 面应为棋盘格');
    }
  });

  t('竖条纹：上下两面棋盘格，侧面竖向三色条', () => {
    const st = applySeq(Patterns.build('stripes-v', 3), 3);
    assert.ok(isCheckerboard(st, 3, 'U') && isCheckerboard(st, 3, 'D'));
    for (const f of ['R', 'F', 'L', 'B']) {
      for (const c of [0, 1, 2]) {
        const col = cell(st, 3, f, 0, c);
        for (let r = 1; r < 3; r++) assert.strictEqual(cell(st, 3, f, r, c), col, f + ' 面第 ' + c + ' 列应整列同色');
        assert.strictEqual(col, c === 1 ? f : OPP[f], f + ' 面中列应为己色、两侧为对色');
      }
    }
  });

  t('横条纹：U/D/F/B 面整行交替，R/L 面呈棋盘格（己色/对色）', () => {
    const st = applySeq(Patterns.build('stripes-h', 3), 3);
    for (const f of ['U', 'D', 'F', 'B']) {
      for (let r = 0; r < 3; r++) {
        const rowV = cell(st, 3, f, r, 0);
        for (let c = 1; c < 3; c++) assert.strictEqual(cell(st, 3, f, r, c), rowV, f + ' 面第 ' + r + ' 行应整行同色');
        assert.ok(rowV === f || rowV === OPP[f], f + ' 面颜色只应为己色或对色');
        if (r > 0) assert.notStrictEqual(rowV, cell(st, 3, f, r - 1, 0), f + ' 面相邻行应异色');
      }
    }
    for (const f of ['R', 'L']) assert.ok(isCheckerboard(st, 3, f), f + ' 面应为棋盘格');
  });

  t('立方体套立方体：每面己色 2×2 角块 + 单色 L 形', () => {
    const st = applySeq(Patterns.build('cube-in-cube', 3), 3);
    const CYCLE = { U: 'F', R: 'U', F: 'R', D: 'B', L: 'D', B: 'L' };
    const BLOCKS = [
      [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 1], [0, 2], [1, 1], [1, 2]],
      [[1, 0], [1, 1], [2, 0], [2, 1]], [[1, 1], [1, 2], [2, 1], [2, 2]]
    ];
    for (const f of FACES) {
      const own = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        if (cell(st, 3, f, r, c) === f) own.push([r, c]);
        else assert.strictEqual(cell(st, 3, f, r, c), CYCLE[f], f + ' 非己色格应为 ' + CYCLE[f]);
      }
      const isBlock = BLOCKS.some(b => JSON.stringify(b) === JSON.stringify(own));
      assert.ok(isBlock && own.length === 4, f + ' 面己色应构成 2×2 角块');
    }
  });
};
