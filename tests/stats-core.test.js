/* 统计核心逻辑测试 */
'use strict';
const assert = require('assert');
const Stats = require('../js/stats-core.js');

function rec(ms, i) { return { id: 'r' + i, timeMs: ms, scramble: 'R U', date: '2026-09-1' + (i % 9) + 'T10:00:00.000Z' }; }
// 构造 n 条成绩，用时 = base + i*step（i 越大越慢）
function make(n, base, step) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(rec(base + i * step, i));
  return arr;
}

module.exports = (t) => {
  t('formatTime：秒与分钟格式', () => {
    assert.strictEqual(Stats.formatTime(12450), '12.45');
    assert.strictEqual(Stats.formatTime(9800), '9.80');
    assert.strictEqual(Stats.formatTime(75230), '1:15.23');
    assert.strictEqual(Stats.formatTime(0), '--');
    assert.strictEqual(Stats.formatTime(-5), '--');
    assert.strictEqual(Stats.formatTime(NaN), '--');
  });

  t('best / mean / 空数据返回 null', () => {
    assert.strictEqual(Stats.best([]), null);
    assert.strictEqual(Stats.mean([]), null);
    assert.strictEqual(Stats.best(null), null);
    const recs = [rec(15000, 0), rec(9900, 1), rec(20000, 2)];
    assert.strictEqual(Stats.best(recs).timeMs, 9900);
    assert.strictEqual(Math.round(Stats.mean(recs)), Math.round((15000 + 9900 + 20000) / 3));
  });

  t('ao5 去掉最好与最差后取平均', () => {
    // 5 次：10,11,12,13,14 秒 → 去 10 与 14 → (11+12+13)/3 = 12s
    const recs = make(5, 10000, 1000);
    const ao = Stats.aoN(recs, 5);
    assert.strictEqual(ao.value, 12000);
    assert.strictEqual(ao.from.timeMs, 10000);
    assert.strictEqual(ao.to.timeMs, 14000);
  });

  t('ao5/ao12 次数不足返回 null；只取最近 N 次', () => {
    assert.strictEqual(Stats.aoN(make(4, 10000, 100), 5), null);
    assert.strictEqual(Stats.aoN(make(11, 10000, 100), 12), null);
    // 12 次里只算最近 12 次：7..18 → 去 7 与 18 → 平均 12.5
    const ao = Stats.aoN(make(12, 7000, 1000), 12);
    assert.strictEqual(ao.value, 12500);
  });

  t('trend：旧→新排序，maxPoints 截取最近几条', () => {
    const recs = make(7, 10000, 500);
    const pts = Stats.trend(recs, 5);
    assert.strictEqual(pts.length, 5);
    assert.strictEqual(pts[0].timeMs, 11000); // 最近 5 条：11s..13s（旧→新）
    assert.strictEqual(pts[4].timeMs, 13000);
    assert.ok(pts.every(p => typeof p.label === 'string'));
  });

  t('summarize：一次给出 count/best/mean/ao5/ao12/recent/trendPoints', () => {
    const recs = make(6, 10000, 1000);
    const s = Stats.summarize(recs);
    assert.strictEqual(s.count, 6);
    assert.strictEqual(s.best.timeMs, 10000);
    assert.strictEqual(s.ao5, 13000); // 最近 5 次 11..15 → 去 11/15 → (12+13+14)/3 = 13s
    assert.strictEqual(s.recent.length, 5);
    assert.strictEqual(s.recent[0].timeMs, 15000); // 新→旧
    assert.strictEqual(s.trendPoints.length, 6);
    assert.strictEqual(s.ao12, null);
  });

  t('summarize 空数据各字段安全', () => {
    const s = Stats.summarize([]);
    assert.strictEqual(s.count, 0);
    assert.strictEqual(s.best, null);
    assert.strictEqual(s.mean, null);
    assert.strictEqual(s.ao5, null);
    assert.deepStrictEqual(s.recent, []);
    assert.deepStrictEqual(s.trendPoints, []);
  });

  t('损坏的成绩（非数字用时）被忽略', () => {
    const recs = [rec(12000, 0), { id: 'x', timeMs: 'bad', scramble: 'R', date: 'z' }, rec(15000, 1)];
    assert.strictEqual(Stats.summarize(recs).count, 2);
    assert.strictEqual(Stats.best(recs).timeMs, 12000);
  });
};
