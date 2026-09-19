/* 外观皮肤：六面配色预设（纯数据模块）。
 * 各皮肤保持"面色家族"与经典一致（白顶红右绿前…），只变色调，
 * 保证教学语境下颜色语义不变。未知 id 回退经典。 */
(function (root) {
  'use strict';

  var SKINS = [
    { id: 'classic', name: '经典',
      colors: { U: 0xf5f6fa, R: 0xe8443a, F: 0x2ecc71, D: 0xf7d716, L: 0xf28c1c, B: 0x2f7ef7 } },
    { id: 'macaron', name: '马卡龙',
      colors: { U: 0xfaf3e0, R: 0xef8fa8, F: 0x9ad9c1, D: 0xf7e8a4, L: 0xf5c396, B: 0x9fc5f8 } },
    { id: 'neon', name: '霓虹',
      colors: { U: 0xfdfdfd, R: 0xff073a, F: 0x39ff14, D: 0xfff200, L: 0xff8c00, B: 0x1f51ff } },
    { id: 'morandi', name: '莫兰迪',
      colors: { U: 0xecebe7, R: 0xbd7d7d, F: 0x8fac8f, D: 0xd6c98c, L: 0xc4a484, B: 0x8494b8 } }
  ];

  function get(id) {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) return SKINS[i];
    return SKINS[0]; // 未知 id 回退经典
  }
  function list() {
    return SKINS.map(function (s) { return { id: s.id, name: s.name }; });
  }

  var api = { list: list, get: get };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Skins = api;
  }
})(typeof self !== 'undefined' ? self : this);
