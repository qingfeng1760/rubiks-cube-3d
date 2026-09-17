/* 统计核心逻辑：把计时器成绩算成最佳/平均/去头尾平均（aoN）/趋势数据。
 * 纯函数，不依赖 DOM。records 为 DataLayer.getRecords() 的成绩数组（按时间先后）。 */
(function (root) {
  'use strict';

  /* 12450 -> "12.45"；75230 -> "1:15.23" */
  function formatTime(ms) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '--';
    var totalSec = ms / 1000;
    var min = Math.floor(totalSec / 60);
    var sec = totalSec - min * 60;
    if (min > 0) {
      var s = sec < 10 ? '0' + sec.toFixed(2) : sec.toFixed(2);
      return min + ':' + s;
    }
    return sec.toFixed(2);
  }

  function valid(records) {
    return (records || []).filter(function (r) {
      return r && typeof r.timeMs === 'number' && isFinite(r.timeMs) && r.timeMs > 0;
    });
  }

  /* 最佳成绩记录；无成绩返回 null */
  function best(records) {
    var list = valid(records);
    if (!list.length) return null;
    return list.reduce(function (a, b) { return b.timeMs < a.timeMs ? b : a; });
  }

  /* 平均用时（ms）；无成绩返回 null */
  function mean(records) {
    var list = valid(records);
    if (!list.length) return null;
    return list.reduce(function (s, r) { return s + r.timeMs; }, 0) / list.length;
  }

  /* 最近 n 次去头尾平均（ao5/ao12，速拧标准）；
   * 不足 n 次返回 null。返回 {value, from, to}，value 为 ms。 */
  function aoN(records, n) {
    var list = valid(records).slice(-n);
    if (list.length < n) return null;
    var sorted = list.slice().sort(function (a, b) { return a.timeMs - b.timeMs; });
    var trimmed = sorted.slice(1, n - 1); // 去掉最好与最差
    var sum = trimmed.reduce(function (s, r) { return s + r.timeMs; }, 0);
    return { value: sum / trimmed.length, from: list[0], to: list[list.length - 1] };
  }

  /* 趋势曲线数据：按时间先后（旧→新），最多取最近 maxPoints 条。
   * 返回 [{timeMs, label, date}]。 */
  function trend(records, maxPoints) {
    var list = valid(records);
    if (maxPoints && list.length > maxPoints) list = list.slice(-maxPoints);
    return list.map(function (r) {
      var d = new Date(r.date);
      return {
        timeMs: r.timeMs,
        date: r.date,
        label: isNaN(d.getTime()) ? '' : (d.getMonth() + 1) + '/' + d.getDate()
      };
    });
  }

  /* 汇总：一次算齐首页/统计页需要的数据 */
  function summarize(records) {
    var list = valid(records);
    var ao5 = aoN(list, 5), ao12 = aoN(list, 12);
    return {
      count: list.length,
      best: best(list),
      mean: mean(list),
      ao5: ao5 ? ao5.value : null,
      ao12: ao12 ? ao12.value : null,
      recent: list.slice(-5).reverse(), // 新→旧，首页用
      trendPoints: trend(list, 50)
    };
  }

  var api = { formatTime: formatTime, best: best, mean: mean, aoN: aoN, trend: trend, summarize: summarize };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.StatsCore = api;
  }
})(typeof self !== 'undefined' ? self : this);
