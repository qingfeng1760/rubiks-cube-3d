/* 魔方核心逻辑测试 */
'use strict';
const assert = require('assert');
const Cube = require('../js/cube-core.js');

const S = Cube.SOLVED;
// 面贴区间：U 0-8, R 9-17, F 18-26, D 27-35, L 36-44, B 45-53
function face(f) { return { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 }[f]; }
function row(f, n) { const s = face(f); return [0, 1, 2].map(i => s + n * 3 + i); }
function col(f, n) { const s = face(f); return [0, 1, 2].map(i => s + i * 3 + n); }
function at(fb, idxs) { return idxs.map(i => fb[i]).join(''); }
function applySeq(seq, from) { return seq.reduce((st, mv) => Cube.applyMove(st, mv), from || S); }

module.exports = (t) => {
  t('还原状态 54 格、每面 9 同色，isSolved=true', () => {
    assert.strictEqual(S.length, 54);
    assert.ok(Cube.isSolved(S));
    for (let f = 0; f < 6; f++) assert.strictEqual(at(S, row('U', 0)), 'UUU');
    const counts = {}; for (const c of S) counts[c] = (counts[c] || 0) + 1;
    assert.deepStrictEqual(counts, { U: 9, R: 9, F: 9, D: 9, L: 9, B: 9 });
  });

  t('任意单步后未还原；同一动作转 4 次回到还原', () => {
    for (const mv of ['U', "U'", 'U2', 'R', "R'", 'F', 'D', 'L', 'B', 'B2']) {
      const once = Cube.applyMove(S, mv);
      assert.ok(!Cube.isSolved(once), mv + ' 后应未还原');
      // X 与 X' 转 4 次还原；X2 转 2 次还原
      const rep = mv.length === 2 && mv[1] === '2' ? 2 : 4;
      const seq = [];
      for (let i = 0; i < rep; i++) seq.push(mv);
      assert.ok(Cube.isSolved(applySeq(seq)), mv + ' 重复后应还原');
    }
  });

  t("U 顺时针：顶层相邻面 F→L、R→F、B→R、L→B；U 面保持同色", () => {
    const u = Cube.applyMove(S, 'U');
    assert.strictEqual(at(u, row('F', 0)), 'RRR'); // 新 F 顶行 = 旧 R 顶行
    assert.strictEqual(at(u, row('L', 0)), 'FFF');
    assert.strictEqual(at(u, row('B', 0)), 'LLL');
    assert.strictEqual(at(u, row('R', 0)), 'BBB');
    assert.strictEqual(at(u, row('U', 0)) + at(u, row('U', 1)) + at(u, row('U', 2)), 'UUUUUUUUU');
    // 中层、底层不动
    assert.strictEqual(at(u, row('F', 2)), 'FFF');
    assert.strictEqual(at(u, row('D', 0)) + at(u, row('D', 1)) + at(u, row('D', 2)), 'DDDDDDDDD');
  });

  t("R 顺时针：F 右列→U 右列、D 右列→B 左列", () => {
    const r = Cube.applyMove(S, 'R');
    assert.strictEqual(at(r, col('U', 2)), 'FFF'); // 新 U 右列 = 旧 F 右列
    assert.strictEqual(at(r, col('F', 2)), 'DDD');
    assert.strictEqual(at(r, col('B', 0)), 'UUU'); // B 靠 R 侧列 = 旧 U 右列
    assert.strictEqual(at(r, col('D', 2)), 'BBB');
    assert.strictEqual(at(r, col('R', 0)) + at(r, col('R', 1)) + at(r, col('R', 2)), 'RRRRRRRRR');
  });

  t("F 顺时针：U 底行→R 前列、L 前列→U 底行、R 前列→D 顶行、D 顶行→L 前列", () => {
    const f = Cube.applyMove(S, 'F');
    assert.strictEqual(at(f, col('R', 2)), 'UUU'); // R 前列(z=+1) = 旧 U 底行
    assert.strictEqual(at(f, row('U', 2)), 'LLL'); // 新 U 底行 = 旧 L 前列
    assert.strictEqual(at(f, row('D', 0)), 'RRR'); // 新 D 顶行 = 旧 R 前列
    assert.strictEqual(at(f, col('L', 0)), 'DDD'); // L 前列(z=+1) = 旧 D 顶行
    assert.strictEqual(at(f, row('F', 0)) + at(f, row('F', 1)) + at(f, row('F', 2)), 'FFFFFFFFF');
  });

  t("逆动作抵消：R 然后 R' 还原；U 然后 U2 U 还原", () => {
    assert.ok(Cube.isSolved(applySeq(['R', "R'"])));
    assert.ok(Cube.isSolved(applySeq(['U', 'U2', 'U'])));
    assert.ok(Cube.isSolved(applySeq(['F', 'D', 'L', "L'", "D'", 'F\''])));
  });

  t('所有基本动作后颜色守恒（每色 9 格）', () => {
    const moves = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];
    for (const mv of moves) {
      const counts = {}; for (const c of Cube.applyMove(S, mv)) counts[c] = (counts[c] || 0) + 1;
      for (const f of Cube.FACES) assert.strictEqual(counts[f], 9, mv + ' 后 ' + f + ' 色应为 9');
    }
  });

  t('打乱：20 步、格式合法、无相邻同面、无三连同轴', () => {
    for (let k = 0; k < 50; k++) {
      const sc = Cube.scramble();
      assert.strictEqual(sc.moves.length, 20);
      const axisOf = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
      for (let i = 0; i < 20; i++) {
        assert.match(sc.moves[i], /^[URFDLB]('|2)?$/);
        if (i > 0) assert.notStrictEqual(sc.moves[i][0], sc.moves[i - 1][0], '相邻同面: ' + sc.text);
      }
      for (let i = 2; i < 20; i++) {
        const a = axisOf[sc.moves[i][0]], b = axisOf[sc.moves[i - 1][0]], c = axisOf[sc.moves[i - 2][0]];
        assert.ok(!(a === b && b === c), '三连同轴: ' + sc.text);
      }
      assert.ok(!Cube.isSolved(applySeq(sc.moves)), '打乱后不应是还原态');
    }
  });

  t('打乱后按逆序逆动作可还原', () => {
    const sc = Cube.scramble();
    const inv = sc.moves.slice().reverse().map(mv => (mv.endsWith("2") ? mv : mv.endsWith("'") ? mv[0] : mv[0] + "'"));
    assert.ok(Cube.isSolved(applySeq(inv, applySeq(sc.moves))));
  });

  t('invertMove：取逆动作（R↔R\'、R2 自逆、层深不变）', () => {
    assert.strictEqual(Cube.invertMove('R'), "R'");
    assert.strictEqual(Cube.invertMove("R'"), 'R');
    assert.strictEqual(Cube.invertMove('R2'), 'R2');
    assert.strictEqual(Cube.invertMove('2R'), "2R'");
    assert.strictEqual(Cube.invertMove("2R'"), '2R');
    assert.strictEqual(Cube.invertMove("U'"), 'U');
    assert.throws(() => Cube.invertMove('X'));
    assert.throws(() => Cube.invertMove('RR'));
    // 性质：任意序列逆序取逆后回到还原（3 阶与 4 阶内层）
    for (let k = 0; k < 20; k++) {
      const sc = Cube.scramble(3);
      const inv = sc.moves.slice().reverse().map(mv => Cube.invertMove(mv));
      assert.ok(Cube.isSolved(applySeq(inv, applySeq(sc.moves))), '逆序取逆应还原: ' + sc.text);
    }
    const seq4 = Cube.scramble(4).moves;
    const inv4 = seq4.slice().reverse().map(mv => Cube.invertMove(mv));
    assert.ok(Cube.isSolved(applySeq(inv4, applySeq(seq4))), '4 阶内层逆序取逆应还原');
  });

  t('moveInfo 解析轴/层/圈数（N=3 坐标：外层 ±2，中层 0）', () => {
    const info = mv => Cube.moveInfo(mv, 3);
    assert.deepStrictEqual(
      { axis: info('U').axis, layer: info('U').layer, turns: info('U').turns },
      { axis: 'y', layer: 2, turns: 1 });
    assert.deepStrictEqual(
      { axis: info("U'").axis, layer: info("U'").layer, turns: info("U'").turns },
      { axis: 'y', layer: 2, turns: 3 });
    assert.deepStrictEqual(
      { axis: info('D2').axis, layer: info('D2').layer, turns: info('D2').turns },
      { axis: 'y', layer: -2, turns: 2 });
    assert.strictEqual(info('R').layer, 2);
    assert.strictEqual(info("L'").layer, -2);
    assert.strictEqual(info('F2').axis, 'z');
    assert.throws(() => Cube.moveInfo('X', 3));
  });
};
