/* 数据读写层测试 */
'use strict';
const assert = require('assert');
const DataLayer = require('../js/data-layer.js');

function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

module.exports = (t) => {
  t('构造时拒绝无效 storage', () => {
    assert.throws(() => new DataLayer(null), /storage/);
    assert.throws(() => new DataLayer({}), /storage/);
  });

  t('初始状态：无魔方进度、空成绩、默认设置', () => {
    const dl = new DataLayer(mockStorage());
    assert.strictEqual(dl.getCubeState(), null);
    assert.deepStrictEqual(dl.getRecords(), []);
    assert.deepStrictEqual(dl.getSettings(), { sound: true, animSpeed: 1, sensitivity: 1, skin: 'classic' });
  });

  t('保存/读取/清除魔方进度（持久化语义：同 storage 实例可复读）', () => {
    const storage = mockStorage();
    const dl = new DataLayer(storage);
    const state = { facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', moves: 23, elapsedMs: 45678, scrambled: true };
    dl.saveCubeState(state);
    assert.deepStrictEqual(new DataLayer(storage).getCubeState(), state); // 模拟重新打开应用
    dl.clearCubeState();
    assert.strictEqual(new DataLayer(storage).getCubeState(), null);
  });

  t('addRecord 追加成绩并自动生成 id/日期；getRecords 顺序保持', () => {
    const dl = new DataLayer(mockStorage());
    const r1 = dl.addRecord(12400, "R U R' F2", '2026-09-18T10:00:00.000Z');
    const r2 = dl.addRecord(9800, "F R U", '2026-09-18T10:05:00.000Z');
    assert.ok(r1.id && r2.id && r1.id !== r2.id);
    assert.strictEqual(r1.timeMs, 12400);
    const list = dl.getRecords();
    assert.strictEqual(list.length, 2);
    assert.deepStrictEqual(list, [r1, r2]);
  });

  t('addRecord 拒绝非法成绩', () => {
    const dl = new DataLayer(mockStorage());
    assert.throws(() => dl.addRecord(-5, 'R U'));
    assert.throws(() => dl.addRecord(1000, ''));
    assert.throws(() => dl.addRecord(NaN, 'R U'));
  });

  t('clearRecords 清空成绩', () => {
    const dl = new DataLayer(mockStorage());
    dl.addRecord(1000, 'R');
    dl.clearRecords();
    assert.deepStrictEqual(dl.getRecords(), []);
  });

  t('练习次数：同日累加，跨日归零', () => {
    const dl = new DataLayer(mockStorage());
    assert.strictEqual(dl.getPractice('2026-09-18'), 0);
    assert.strictEqual(dl.incrementPractice('2026-09-18'), 1);
    assert.strictEqual(dl.incrementPractice('2026-09-18'), 2);
    assert.strictEqual(dl.getPractice('2026-09-18'), 2);
    assert.strictEqual(dl.getPractice('2026-09-19'), 0); // 新的一天
    assert.strictEqual(dl.incrementPractice('2026-09-19'), 1);
  });

  t('设置：updateSettings 部分更新，未知键被忽略', () => {
    const dl = new DataLayer(mockStorage());
    dl.updateSettings({ sound: false, hack: 'x' });
    assert.deepStrictEqual(dl.getSettings(), { sound: false, animSpeed: 1, sensitivity: 1, skin: 'classic' });
    dl.updateSettings({ animSpeed: 0.5 });
    assert.strictEqual(dl.getSettings().animSpeed, 0.5);
    assert.strictEqual(dl.getSettings().sound, false); // 未覆盖的键保留
  });

  t('导出包含全部四类数据与版本号', () => {
    const dl = new DataLayer(mockStorage());
    dl.saveCubeState({ facelets: 'X', moves: 1, elapsedMs: 2, scrambled: false });
    dl.addRecord(12000, 'R U R\'');
    dl.incrementPractice('2026-09-18');
    dl.updateSettings({ sound: false });
    const parsed = JSON.parse(dl.exportData());
    assert.strictEqual(parsed.app, '3d-rubik');
    assert.strictEqual(parsed.version, DataLayer.SCHEMA_VERSION);
    assert.ok(parsed.exportedAt);
    assert.strictEqual(parsed.data.records.length, 1);
    assert.strictEqual(parsed.data.practice.count, 1);
    assert.strictEqual(parsed.data.settings.sound, false);
    assert.ok(parsed.data.cube);
  });

  t('A15 导出→清空→导入 后数据完全恢复', () => {
    const storage = mockStorage();
    const dl = new DataLayer(storage);
    dl.saveCubeState({ facelets: 'X', moves: 7, elapsedMs: 999, scrambled: true });
    dl.addRecord(15500, "R U R' F");
    dl.incrementPractice('2026-09-18');
    dl.updateSettings({ sound: false, animSpeed: 0.6 });
    const backup = dl.exportData();

    dl.clearAll();
    assert.strictEqual(dl.getCubeState(), null);
    assert.deepStrictEqual(dl.getRecords(), []);
    assert.deepStrictEqual(dl.getSettings(), { sound: true, animSpeed: 1, sensitivity: 1, skin: 'classic' });

    dl.importData(backup);
    assert.deepStrictEqual(dl.getCubeState(), { facelets: 'X', moves: 7, elapsedMs: 999, scrambled: true });
    assert.strictEqual(dl.getRecords().length, 1);
    assert.strictEqual(dl.getRecords()[0].timeMs, 15500);
    assert.strictEqual(dl.getPractice('2026-09-18'), 1);
    assert.deepStrictEqual(dl.getSettings(), { sound: false, animSpeed: 0.6, sensitivity: 1, skin: 'classic' });
  });

  t('A16 导入非法文件报错且不破坏现有数据', () => {
    const dl = new DataLayer(mockStorage());
    dl.addRecord(12300, 'R U');
    const before = dl.getRecords();
    for (const bad of ['not json', '{"app":"other"}', '{}', '{"app":"3d-rubik","version":99,"data":{}}']) {
      assert.throws(() => dl.importData(bad), /导入失败/);
    }
    assert.deepStrictEqual(dl.getRecords(), before);
  });

  t('导入文件里损坏的成绩记录被过滤，其余正常导入', () => {
    const dl = new DataLayer(mockStorage());
    const imported = dl.importData(JSON.stringify({
      app: '3d-rubik', version: 1,
      data: { records: [{ id: 'a', timeMs: 1000, scramble: 'R', date: 'x' }, { bad: true }, { id: 'b', timeMs: -1, scramble: 'R', date: 'x' }] }
    }));
    assert.strictEqual(imported.records.length, 1);
    assert.strictEqual(dl.getRecords().length, 1);
  });

  t('storage 中 JSON 损坏时按默认值处理，不崩溃', () => {
    const storage = mockStorage();
    storage.setItem('rubik.records.v1', '{broken json');
    const dl = new DataLayer(storage);
    assert.deepStrictEqual(dl.getRecords(), []);
  });

  t('皮肤设置：默认 classic，可更新持久化，旧数据缺省回退，导出导入往返', () => {
    const storage = mockStorage();
    const dl = new DataLayer(storage);
    assert.strictEqual(dl.getSettings().skin, 'classic');
    dl.updateSettings({ skin: 'neon' });
    assert.strictEqual(new DataLayer(storage).getSettings().skin, 'neon');
    // 一期旧数据（无 skin 字段）→ 回退默认，不崩溃
    storage.setItem('rubik.settings.v1', JSON.stringify({ sound: true, animSpeed: 1, sensitivity: 1 }));
    assert.strictEqual(new DataLayer(storage).getSettings().skin, 'classic');
    // 导出 → 清空 → 导入：皮肤随数据恢复
    const storage2 = mockStorage();
    const dl2 = new DataLayer(storage2);
    dl2.updateSettings({ skin: 'morandi' });
    const backup = dl2.exportData();
    dl2.clearAll();
    dl2.importData(backup);
    assert.strictEqual(dl2.getSettings().skin, 'morandi');
  });
};
