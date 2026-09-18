#!/usr/bin/env node
/* 空间清理工具：回收构建缓存与运行期残留（纯 Node、零依赖）。
 *
 * 用法（默认 dry-run，只报告不删除；加 --yes 才真正删除）：
 *   node tools/clean.js                 列出所有可清理目标与大小
 *   node tools/clean.js --yes           清理构建缓存 + 测试产物（= --build + --dist）
 *   node tools/clean.js --build --yes   只清构建缓存（target/debug + target/release）
 *   node tools/clean.js --debug --yes   只清 debug 缓存（cargo check 产物）
 *   node tools/clean.js --release --yes 只清 release 缓存（下次打包需重新编译依赖）
 *   node tools/clean.js --dist  --yes   只清测试产物（自检数据/自检输出/资源暂存）
 *   node tools/clean.js --userdata --yes  ★清空应用数据（成绩/进度/设置），不可恢复！
 *
 * 安全约定：TARGETS 中的任何目标都不得与 PROTECTED 中的路径相同或互相包含，
 * 违反时直接报错退出（守卫函数 assertSafeTargets），保证源码与交付物永不被误删。
 * 用户数据（data/）不参与 --all，必须显式 --userdata 才会清理。
 * 核心逻辑导出为函数，供 tests/clean.test.js 在临时目录里做真行为测试。 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..');

/* 可清理目标（相对项目根目录）：全部是"可再生"的内容 */
const TARGETS = {
  debug: ['src-tauri/target/debug'],
  release: ['src-tauri/target/release'],
  dist: [
    'dist/3D魔方/data-smoke',    // 自检专用的 WebView2 数据目录（测试产物，可放心删）
    'dist/3D魔方/smoke-result.json', // 自检产物
    'dist/3D魔方/smoke.png',
    'src-tauri/webdist'          // 打包时暂存的网页资源，构建脚本自动重建
  ],
  /* 用户数据（成绩/进度/设置）单独一档：默认不清理，需显式 --userdata 并二次确认 */
  userdata: ['dist/3D魔方/data']
};

/* 保护清单：任何模式下都不得被删（与目标相同或互相包含即报错） */
const PROTECTED = [
  'dist/3D魔方/3D魔方.exe',
  'dist/3D魔方/使用说明.txt',
  'index.html', 'css', 'js', 'tests', 'tools', 'README.md', 'LICENSE',
  'src-tauri/src', 'src-tauri/icons', 'src-tauri/capabilities', 'src-tauri/gen',
  'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'src-tauri/build.rs',
  '.git'
];

/* ---- 工具函数 ---- */
function dirSize(p) {
  let total = 0, files = 0;
  const walk = (cur) => {
    let st;
    try { st = fs.lstatSync(cur); } catch (e) { return; }
    if (st.isDirectory()) {
      let entries = [];
      try { entries = fs.readdirSync(cur); } catch (e) { return; }
      for (const e of entries) walk(path.join(cur, e));
    } else {
      total += st.size;
      files += 1;
    }
  };
  walk(p);
  return { bytes: total, files: files };
}

function human(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function insideOf(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/* 守卫：目标必须落在项目内，且与保护清单不冲突 */
function assertSafeTargets(root, relPaths) {
  const absRoot = path.resolve(root);
  for (const rel of relPaths) {
    const abs = path.resolve(absRoot, rel);
    if (abs === absRoot || !insideOf(abs, absRoot)) {
      throw new Error('清理目标越界（必须在项目目录内）: ' + rel);
    }
    for (const prot of PROTECTED) {
      const absProt = path.resolve(absRoot, prot);
      if (abs === absProt) throw new Error('清理目标命中保护路径: ' + rel);
      if (insideOf(absProt, abs)) throw new Error('清理目标会连带删除保护路径 ' + prot + ': ' + rel);
      if (insideOf(abs, absProt)) throw new Error('清理目标位于保护路径 ' + prot + ' 内: ' + rel);
    }
  }
  return true;
}

/* 组装计划：返回 [{ rel, abs, exists, bytes, files }] */
function planClean(root, opts) {
  const sel = [];
  if (opts.debug) sel.push(...TARGETS.debug);
  if (opts.release) sel.push(...TARGETS.release);
  if (opts.dist) sel.push(...TARGETS.dist);
  if (opts.userdata) sel.push(...TARGETS.userdata);
  assertSafeTargets(root, sel);
  const absRoot = path.resolve(root);
  return sel.map((rel) => {
    const abs = path.resolve(absRoot, rel);
    const exists = fs.existsSync(abs);
    const size = exists ? dirSize(abs) : { bytes: 0, files: 0 };
    return { rel: rel, abs: abs, exists: exists, bytes: size.bytes, files: size.files };
  });
}

/* 执行清理：dryRun=true 时只统计不删除 */
function runClean(root, opts) {
  const dryRun = opts.dryRun !== false;
  const items = planClean(root, opts);
  let freed = 0;
  const removed = [];
  for (const it of items) {
    if (!it.exists) continue;
    if (!dryRun) {
      const st = fs.lstatSync(it.abs);
      if (st.isDirectory()) fs.rmSync(it.abs, { recursive: true, force: true });
      else fs.rmSync(it.abs, { force: true });
    }
    freed += it.bytes;
    removed.push(it);
  }
  return { dryRun: dryRun, items: items, removed: removed, freed: freed };
}

module.exports = { TARGETS, PROTECTED, planClean, assertSafeTargets, runClean, dirSize, human };

/* ---- CLI ---- */
if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*/, '').trim());
    process.exit(0);
  }
  const want = (f) => argv.includes(f);
  const yes = want('--yes');
  const explicit = want('--debug') || want('--release') || want('--build') || want('--dist') || want('--userdata');
  const all = want('--all') || argv.length === 0 || (yes && !explicit);
  const opts = {
    debug: all || want('--debug') || want('--build'),
    release: all || want('--release') || want('--build'),
    dist: all || want('--dist'),
    userdata: want('--userdata'),   // 永不包含在 --all 里
    dryRun: !yes
  };
  if (opts.userdata) {
    console.log('⚠ 已选择清理应用数据（成绩/进度/设置），此操作不可恢复！');
    if (!yes) console.log('  （当前为 dry-run；确认要清空请执行 node tools/clean.js --userdata --yes）');
  }

  let result;
  try {
    result = runClean(DEFAULT_ROOT, opts);
  } catch (e) {
    console.error('清理中止：' + e.message);
    process.exit(1);
  }

  console.log('项目根目录：' + DEFAULT_ROOT);
  console.log(result.dryRun ? '模式：dry-run（只报告；加 --yes 才真正删除）' : '模式：执行删除');
  console.log('');
  for (const it of result.items) {
    const mark = it.exists ? (result.dryRun ? '可清理' : '已清理') : '不存在';
    console.log(`  [${mark}] ${it.rel}  ${human(it.bytes)}${it.files ? '（' + it.files + ' 个文件）' : ''}`);
  }
  console.log('');
  console.log(`合计${result.dryRun ? '可回收' : '已回收'}：${human(result.freed)}`);
  if (result.dryRun && result.freed > 0) console.log('提示：确认后执行 node tools/clean.js --yes');
}