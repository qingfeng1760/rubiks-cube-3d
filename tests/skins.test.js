/* 外观皮肤测试：预设完整、颜色合法、回退安全 */
'use strict';
const assert = require('assert');
const Skins = require('../js/skins.js');

module.exports = (t) => {
  t('皮肤预设完整（≥4 套、六面齐全、颜色合法且互不相同）', () => {
    const list = Skins.list();
    assert.ok(list.length >= 4, '至少 4 套皮肤');
    const ids = new Set(list.map(s => s.id));
    assert.strictEqual(ids.size, list.length, 'id 不重复');
    assert.ok(ids.has('classic'), '必须包含经典皮肤');
    list.forEach(({ id }) => {
      const skin = Skins.get(id);
      assert.ok(typeof skin.name === 'string' && skin.name.length > 0, id + ' 缺名称');
      assert.deepStrictEqual(Object.keys(skin.colors).sort(), ['B', 'D', 'F', 'L', 'R', 'U'], id + ' 六面色不全');
      const vals = Object.values(skin.colors);
      vals.forEach(v => assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffff, id + ' 颜色值非法: ' + v));
      assert.strictEqual(new Set(vals).size, 6, id + ' 六色必须互不相同');
    });
  });

  t('未知皮肤 id 回退经典，不抛错', () => {
    assert.deepStrictEqual(Skins.get('no-such-skin').colors, Skins.get('classic').colors);
    assert.strictEqual(Skins.get(undefined).id, 'classic');
  });

  t('各皮肤颜色不过暗，贴纸在深色底上可辨', () => {
    Skins.list().forEach(({ id }) => {
      const { colors } = Skins.get(id);
      for (const f of Object.keys(colors)) {
        const v = colors[f];
        assert.ok(v > 0x101010, id + ' 的 ' + f + ' 色过暗，深色底上贴纸会看不清');
      }
    });
  });
};
