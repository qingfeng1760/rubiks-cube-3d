/* 高阶魔方（2/4/5 阶）核心逻辑测试；3 阶兼容性回归在 cube-core.test.js */
'use strict';
const assert = require('assert');
const Cube = require('../js/cube-core.js');

function solved(N) { return Cube.solvedState(N); }
function faceSize(N) { return N * N; }
function colorCounts(fb) {
  const counts = {};
  for (const c of fb) counts[c] = (counts[c] || 0) + 1;
  return counts;
}
function applySeq(seq, from) { return seq.reduce((st, mv) => Cube.applyMove(st, mv), from); }
function invert(seq) {
  return seq.slice().reverse().map(mv => {
    const m = /^(\d)?([URFDLB])(2|')?$/.exec(mv);
    const suffix = m[3] === '2' ? '2' : m[3] === "'" ? '' : "'";
    return (m[1] || '') + m[2] + suffix;
  });
}

module.exports = (t) => {
  [2, 4, 5].forEach((N) => {
    t(`N=${N}：还原态 ${6 * N * N} 格、每面同色、isSolved=true`, () => {
      const s = solved(N);
      assert.strictEqual(s.length, 6 * N * N);
      assert.ok(Cube.isSolved(s));
      assert.strictEqual(Cube.orderOf(s), N);
    });

    t(`N=${N}：单步后未还原，转 4 次还原，逆动作抵消`, () => {
      for (const mv of ['R', "R'", 'U', 'F']) {
        const once = Cube.applyMove(solved(N), mv);
        assert.ok(!Cube.isSolved(once), mv + ' 后应未还原');
        const four = Array(4).fill(mv);
        assert.ok(Cube.isSolved(applySeq(four, solved(N))), mv + ' 转 4 次应还原');
        assert.ok(Cube.isSolved(applySeq([mv, mv.endsWith("'") ? mv.replace("'", '') : mv + "'"], solved(N))));
      }
    });

    t(`N=${N}：所有动作后颜色守恒（每色 ${N * N} 格）`, () => {
      const moves = ['U', "U'", 'R', "R'", 'F2', 'D', 'L', 'B2'];
      for (const mv of moves) {
        const counts = colorCounts(Cube.applyMove(solved(N), mv));
        for (const f of Cube.FACES) assert.strictEqual(counts[f], N * N, mv + ' 后 ' + f + ' 色应为 ' + N * N);
      }
    });

    t(`N=${N}：打乱合法、未还原、逆序可还原`, () => {
      for (let k = 0; k < 20; k++) {
        const sc = Cube.scramble(N);
        assert.ok(sc.moves.length >= 12);
        const depthMax = Math.floor(N / 2);
        for (const mv of sc.moves) {
          assert.match(mv, /^(\d)?[URFDLB]('|2)?$/, '非法记号: ' + mv);
          const depth = parseInt(mv, 10) || 1;
          assert.ok(depth >= 1 && depth <= Math.max(1, depthMax), '层深越界: ' + mv);
        }
        for (let i = 1; i < sc.moves.length; i++) {
          const a = /^(\d)?/.exec(sc.moves[i])[1] || '1';
          const b = /^(\d)?/.exec(sc.moves[i - 1])[1] || '1';
          assert.notStrictEqual(
            sc.moves[i][sc.moves[i].search(/[URFDLB]/)] + a,
            sc.moves[i - 1][sc.moves[i - 1].search(/[URFDLB]/)] + b,
            '相邻同层同面: ' + sc.text);
        }
        const scrambled = applySeq(sc.moves, solved(N));
        assert.ok(!Cube.isSolved(scrambled));
        assert.ok(Cube.isSolved(applySeq(invert(sc.moves), scrambled)));
      }
    });
  });

  t('N=4：内层动作 2R 解析与生效', () => {
    const s = solved(4);
    const once = Cube.applyMove(s, "2R'");
    assert.ok(!Cube.isSolved(once));
    assert.ok(Cube.isSolved(applySeq(["2R'", '2R'], s)));
    assert.ok(Cube.isSolved(applySeq(['2R', '2R', '2R', '2R'], s)));
    const info = Cube.moveInfo("2R'", 4);
    assert.strictEqual(info.axis, 'x');
    assert.strictEqual(info.layer, 1);   // 4 阶：外层 +3，内层 +1
    assert.strictEqual(info.turns, 3);
    assert.strictEqual(Cube.moveInfo('R', 4).layer, 3);
    // 外层与内层置换不同（4 阶没有真正的中心块，2R 应改变中心区颜色）
    assert.notStrictEqual(Cube.applyMove(s, 'R'), Cube.applyMove(s, '2R'));
  });

  t('N=5：层坐标与中层动作', () => {
    assert.strictEqual(Cube.moveInfo('R', 5).layer, 4);
    assert.strictEqual(Cube.moveInfo('2R', 5).layer, 2);
    assert.strictEqual(Cube.moveInfo('3R', 5).layer, 0);  // 5 阶正中层
    assert.strictEqual(Cube.moveInfo('2L', 5).layer, -2);
    assert.strictEqual(Cube.moveInfo('2B', 5).layer, -2); // 负面内层不再为空操作
    assert.ok(!Cube.isSolved(Cube.applyMove(solved(5), '2L')));
    assert.ok(!Cube.isSolved(Cube.applyMove(solved(5), '2B')));
    const mid = Cube.applyMove(solved(5), '3F');
    assert.ok(!Cube.isSolved(mid));
    assert.ok(Cube.isSolved(applySeq(['3F', "3F'"], solved(5))));
    assert.throws(() => Cube.applyMove(solved(5), '5R')); // 层深最多 N-1
  });

  t('层深越界与偶数阶无正中层', () => {
    assert.throws(() => Cube.applyMove(solved(3), '3R'));  // 3 阶只有内层 2
    assert.throws(() => Cube.applyMove(solved(2), '2R'));  // 2 阶没有内层
    assert.throws(() => Cube.applyMove(solved(4), '4R'));
    assert.throws(() => Cube.parseMove('2R', 2));
  });

  t('dragToMove：层坐标 → 动作记法（含内层与中层）', () => {
    assert.strictEqual(Cube.dragToMove('x', 2, 1, 3), "R'");      // 3 阶 R 外层（dir=+1 为逆时针）
    assert.strictEqual(Cube.dragToMove('x', 0, 1, 3), "2R'");     // 3 阶正中层 → 正轴面的层
    assert.strictEqual(Cube.dragToMove('x', 3, -1, 4), 'R');     // dir=-1（顺时针）
    assert.strictEqual(Cube.dragToMove('x', 3, 1, 4), "R'");     // dir=+1（逆时针）
    assert.strictEqual(Cube.dragToMove('x', 1, 1, 4), "2R'");
    assert.strictEqual(Cube.dragToMove('y', -2, 1, 5), '2D');    // 5 阶负坐标内层 → D 面
    assert.strictEqual(Cube.dragToMove('z', -2, 1, 5), '2B');    // z 轴负层 → B 面
    assert.strictEqual(Cube.dragToMove('y', 0, 1, 5), "3U'");    // 5 阶正中层
    assert.strictEqual(Cube.dragToMove('y', 4, 1, 5), "U'");     // dir=+1（逆时针）
    assert.strictEqual(Cube.dragToMove('y', -4, 1, 5), 'D');
    // 往返一致：dragToMove 产生的动作经 moveInfo 还原同一层（只使用真实存在的层坐标）
    for (const [ax, layer, dir, N] of [['x', 3, -1, 4], ['x', 1, 1, 4], ['y', -2, 1, 5], ['y', 2, -1, 5], ['z', 1, -1, 4], ['y', 0, 1, 5]]) {
      const mv = Cube.dragToMove(ax, layer, dir, N);
      const info = Cube.moveInfo(mv, N);
      assert.strictEqual(info.axis, ax, mv + ' 轴不符');
      assert.strictEqual(info.layer, layer, mv + ' 层不符');
    }
  });

  t('scramble 默认步数按阶数递增', () => {
    assert.strictEqual(Cube.scramble(2).moves.length, 12);
    assert.strictEqual(Cube.scramble(3).moves.length, 20);
    assert.strictEqual(Cube.scramble(4).moves.length, 32);
    assert.strictEqual(Cube.scramble(5).moves.length, 45);
  });
};
