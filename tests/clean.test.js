/* 清理工具（tools/clean.js）的真行为测试：在系统临时目录里搭假目录树演练，
 * 验证"dry-run 不删任何东西""各档只删该删的""交付物 exe 与用户数据永不被误删"，
 * 以及守卫会拒绝指向源码/交付物的清理目标。不触碰真实项目目录。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const clean = require('../tools/clean.js');

const FAKE_FILES = [
  'src-tauri/target/debug/deps/libfoo.rlib',
  'src-tauri/target/release/deps/libbar.rlib',
  'src-tauri/target/release/rubik3d.exe',
  'src-tauri/webdist/index.html',
  'dist/3D魔方/3D魔方.exe',
  'dist/3D魔方/使用说明.txt',
  'dist/3D魔方/data/EBWebView/cache.bin',         // 用户数据（成绩/进度/设置）
  'dist/3D魔方/data-smoke/EBWebView/cache.bin',   // 自检专用数据
  'dist/3D魔方/smoke-result.json',
  'dist/3D魔方/smoke.png',
  'js/app.js',
  'index.html'
];

function makeTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rubik-clean-'));
  for (const f of FAKE_FILES) {
    const p = path.join(root, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x'.repeat(64));
  }
  return root;
}
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
function dropTree(root) { fs.rmSync(root, { recursive: true, force: true }); }

module.exports = (t) => {
  t('dry-run：只统计不删除，任何文件都不动', () => {
    const root = makeTree();
    try {
      const r = clean.runClean(root, { debug: true, release: true, dist: true, dryRun: true });
      assert.ok(r.freed > 0, '应统计出可回收空间');
      assert.strictEqual(r.removed.length, 6, '应有 6 个存在的目标被列入');
      for (const f of FAKE_FILES) assert.ok(exists(root, f), 'dry-run 不得删除: ' + f);
    } finally { dropTree(root); }
  });

  t('--build：只清构建缓存，交付物/用户数据/自检数据完好', () => {
    const root = makeTree();
    try {
      clean.runClean(root, { debug: true, release: true, dryRun: false });
      assert.ok(!exists(root, 'src-tauri/target/debug'), 'debug 缓存应被清');
      assert.ok(!exists(root, 'src-tauri/target/release'), 'release 缓存应被清');
      assert.ok(exists(root, 'dist/3D魔方/3D魔方.exe'), 'exe 不得被删');
      assert.ok(exists(root, 'dist/3D魔方/data/EBWebView/cache.bin'), '用户数据不得被删');
      assert.ok(exists(root, 'js/app.js') && exists(root, 'index.html'), '源码不得被删');
    } finally { dropTree(root); }
  });

  t('--dist：清自检数据与暂存，exe、使用说明与用户数据完好', () => {
    const root = makeTree();
    try {
      clean.runClean(root, { dist: true, dryRun: false });
      assert.ok(!exists(root, 'dist/3D魔方/data-smoke'), '自检数据应被清');
      assert.ok(!exists(root, 'dist/3D魔方/smoke-result.json') && !exists(root, 'dist/3D魔方/smoke.png'), '自检产物应被清');
      assert.ok(!exists(root, 'src-tauri/webdist'), '暂存目录应被清');
      assert.ok(exists(root, 'dist/3D魔方/3D魔方.exe'), 'exe 不得被删');
      assert.ok(exists(root, 'dist/3D魔方/使用说明.txt'), '使用说明不得被删');
      assert.ok(exists(root, 'dist/3D魔方/data/EBWebView/cache.bin'), '★用户数据不在 --dist 范围内');
      assert.ok(exists(root, 'src-tauri/target/release/rubik3d.exe'), '构建缓存不在本档范围');
    } finally { dropTree(root); }
  });

  t('用户数据需显式 --userdata：默认各档都不碰，显式指定才清', () => {
    const root = makeTree();
    try {
      // 默认（--build/--dist）不包含用户数据
      const plan = clean.planClean(root, { debug: true, release: true, dist: true });
      assert.ok(!plan.some((it) => it.rel === 'dist/3D魔方/data'), '默认计划不得包含用户数据');
      // 显式指定才清
      clean.runClean(root, { userdata: true, dryRun: false });
      assert.ok(!exists(root, 'dist/3D魔方/data'), '显式 --userdata 时应清空应用数据');
      assert.ok(exists(root, 'dist/3D魔方/3D魔方.exe'), '即使清数据，exe 也必须保留');
    } finally { dropTree(root); }
  });

  t('守卫：拒绝会连带/命中交付物与源码的清理目标', () => {
    const root = makeTree();
    try {
      assert.throws(() => clean.assertSafeTargets(root, ['dist/3D魔方']), /保护路径/, '含 exe 的目录必须被拒绝');
      assert.throws(() => clean.assertSafeTargets(root, ['js']), /保护路径/, '源码目录必须被拒绝');
      assert.throws(() => clean.assertSafeTargets(root, ['dist/3D魔方/3D魔方.exe']), /保护路径/, 'exe 本身必须被拒绝');
      assert.throws(() => clean.assertSafeTargets(root, ['../..']), /越界/, '项目外路径必须被拒绝');
      assert.ok(clean.assertSafeTargets(root, ['src-tauri/target/debug', 'dist/3D魔方/data-smoke', 'dist/3D魔方/data']),
        '正常目标（含显式指定的用户数据）应通过');
    } finally { dropTree(root); }
  });

  t('内置目标表只包含可再生内容（源码/交付物白名单校验）', () => {
    const allow = ['src-tauri/target/', 'dist/3D魔方/data-smoke', 'dist/3D魔方/data',
      'dist/3D魔方/smoke-result.json', 'dist/3D魔方/smoke.png', 'src-tauri/webdist'];
    const all = [].concat(clean.TARGETS.debug, clean.TARGETS.release, clean.TARGETS.dist, clean.TARGETS.userdata);
    assert.ok(all.length >= 6, '目标表不应为空');
    for (const rel of all) {
      assert.ok(allow.some((p) => rel === p || rel.startsWith(p)), '目标不在白名单内: ' + rel);
      assert.ok(!/\.exe$/.test(rel) && !/使用说明/.test(rel), '目标不得是交付物: ' + rel);
    }
    assert.ok(clean.PROTECTED.some((p) => p.endsWith('3D魔方.exe')), '保护清单必须包含 exe');
    assert.ok(clean.TARGETS.userdata.length === 1 && clean.TARGETS.userdata[0] === 'dist/3D魔方/data',
      '用户数据必须单独成档（不与 --all 混在一起）');
  });
};