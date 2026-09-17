/* 数据读写层 —— 业务代码不允许直接访问 localStorage，必须经过本模块。
 * 构造时注入 storage（浏览器传 window.localStorage，测试传 mock），
 * 以后替换为云数据库只需改本文件。 */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var KEYS = {
    cube: 'rubik.cube.v1',
    records: 'rubik.records.v1',
    practice: 'rubik.practice.v1',
    settings: 'rubik.settings.v1'
  };

  function defaultSettings() {
    return { sound: true, animSpeed: 1, sensitivity: 1 };
  }

  function defaultData() {
    return {
      cube: null, // null = 没有进行中的一局
      records: [],
      practice: { date: null, count: 0 },
      settings: defaultSettings()
    };
  }

  function todayStr(now) {
    var d = now || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function isPlainObject(v) {
    return Object.prototype.toString.call(v) === '[object Object]';
  }

  function DataLayer(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('DataLayer: 需要一个实现 getItem/setItem/removeItem 的 storage');
    }
    this.storage = storage;
  }

  DataLayer.prototype._read = function (key, fallback) {
    var raw = this.storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  };

  DataLayer.prototype._write = function (key, value) {
    this.storage.setItem(key, JSON.stringify(value));
  };

  /* ---- 魔方进行中状态 ---- */
  DataLayer.prototype.getCubeState = function () {
    return this._read(KEYS.cube, null);
  };
  DataLayer.prototype.saveCubeState = function (state) {
    if (!isPlainObject(state)) throw new Error('saveCubeState: state 必须是对象');
    this._write(KEYS.cube, state);
  };
  DataLayer.prototype.clearCubeState = function () {
    this.storage.removeItem(KEYS.cube);
  };

  /* ---- 计时器成绩 ---- */
  function validRecord(r) {
    return isPlainObject(r)
      && typeof r.id === 'string'
      && typeof r.timeMs === 'number' && isFinite(r.timeMs) && r.timeMs > 0
      && typeof r.scramble === 'string' && r.scramble.length > 0
      && typeof r.date === 'string';
  }

  DataLayer.prototype.getRecords = function () {
    var v = this._read(KEYS.records, []);
    return Array.isArray(v) ? v : [];
  };
  DataLayer.prototype.addRecord = function (timeMs, scramble, dateStr) {
    var rec = {
      id: 'r' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      timeMs: Math.round(timeMs),
      scramble: String(scramble),
      date: dateStr || new Date().toISOString()
    };
    if (!validRecord(rec)) throw new Error('addRecord: 成绩数据不合法');
    var list = this.getRecords();
    list.push(rec);
    this._write(KEYS.records, list);
    return rec;
  };
  DataLayer.prototype.clearRecords = function () {
    this._write(KEYS.records, []);
  };

  /* ---- 今日练习次数 ---- */
  DataLayer.prototype.getPractice = function (dateStr) {
    var v = this._read(KEYS.practice, { date: null, count: 0 });
    return (v && v.date === dateStr) ? v.count : 0;
  };
  DataLayer.prototype.incrementPractice = function (dateStr) {
    var d = dateStr || todayStr();
    var v = this._read(KEYS.practice, { date: null, count: 0 });
    var count = (v && v.date === d) ? v.count + 1 : 1;
    this._write(KEYS.practice, { date: d, count: count });
    return count;
  };

  /* ---- 设置 ---- */
  DataLayer.prototype.getSettings = function () {
    var v = this._read(KEYS.settings, defaultSettings());
    var s = defaultSettings();
    for (var k in s) if (k in v) s[k] = v[k];
    return s;
  };
  DataLayer.prototype.updateSettings = function (patch) {
    if (!isPlainObject(patch)) throw new Error('updateSettings: patch 必须是对象');
    var s = this.getSettings();
    for (var k in patch) if (k in s) s[k] = patch[k];
    this._write(KEYS.settings, s);
    return s;
  };

  /* ---- 导出 / 导入 / 清空 ---- */
  DataLayer.prototype.exportData = function () {
    return JSON.stringify({
      app: '3d-rubik',
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        cube: this.getCubeState(),
        records: this.getRecords(),
        practice: this._read(KEYS.practice, { date: null, count: 0 }),
        settings: this.getSettings()
      }
    });
  };

  /* 导入成功返回应用的数据对象；格式不符抛 Error，不写入任何数据 */
  DataLayer.prototype.importData = function (jsonText) {
    var parsed;
    try { parsed = JSON.parse(jsonText); }
    catch (e) { throw new Error('导入失败：不是合法的 JSON 文件'); }
    if (!isPlainObject(parsed) || parsed.app !== '3d-rubik' || !isPlainObject(parsed.data)) {
      throw new Error('导入失败：不是本应用导出的数据文件');
    }
    if (typeof parsed.version !== 'number' || parsed.version > SCHEMA_VERSION) {
      throw new Error('导入失败：数据版本过新（文件 v' + parsed.version + '，应用 v' + SCHEMA_VERSION + '）');
    }
    var d = parsed.data;
    var records = Array.isArray(d.records) ? d.records.filter(validRecord) : [];
    var practice = isPlainObject(d.practice) ? d.practice : { date: null, count: 0 };
    var cube = isPlainObject(d.cube) ? d.cube : null;
    var settings = isPlainObject(d.settings) ? Object.assign(defaultSettings(), d.settings) : defaultSettings();

    // 全部校验通过后才落盘
    if (cube) this._write(KEYS.cube, cube); else this.storage.removeItem(KEYS.cube);
    this._write(KEYS.records, records);
    this._write(KEYS.practice, practice);
    this._write(KEYS.settings, settings);
    return { cube: cube, records: records, practice: practice, settings: settings };
  };

  DataLayer.prototype.clearAll = function () {
    for (var k in KEYS) this.storage.removeItem(KEYS[k]);
  };

  DataLayer.SCHEMA_VERSION = SCHEMA_VERSION;
  DataLayer.todayStr = todayStr;

  /* UMD：浏览器挂 window.DataLayer，Node 走 module.exports 供测试 */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataLayer;
  } else {
    root.DataLayer = DataLayer;
  }
})(typeof self !== 'undefined' ? self : this);
