#!/usr/bin/env node
/* 打包脚本：把网页应用打成 Windows 绿色版文件夹 dist\3D魔方\
 * 用法：
 *   node tools/build-exe.js            完整打包（暂存资源 → 图标 → cargo build --release → 组装 dist）
 *   node tools/build-exe.js --check    只做暂存 + 图标 + cargo check（快速校验工程是否可编译）
 *   node tools/build-exe.js --stage    只暂存网页资源（frontendDist）与图标
 * 说明：不生成安装包、不依赖 Tauri CLI、不访问 GitHub（crates 走本机已配置的镜像）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const srcTauri = path.join(root, 'src-tauri');
const webdist = path.join(srcTauri, 'webdist');
const distDir = path.join(root, 'dist', '3D魔方');
const mode = process.argv[2] || '';

/* ---- 1. 暂存网页资源（只含运行所需，不含 tests/.git/文档） ---- */
function stage() {
  fs.rmSync(webdist, { recursive: true, force: true });
  fs.mkdirSync(webdist, { recursive: true });
  fs.copyFileSync(path.join(root, 'index.html'), path.join(webdist, 'index.html'));
  for (const d of ['css', 'js']) {
    fs.cpSync(path.join(root, d), path.join(webdist, d), { recursive: true });
  }
  const need = ['index.html', 'css/style.css', 'js/app.js', 'js/cube3d.js', 'js/cube-core.js',
    'js/data-layer.js', 'js/stats-core.js', 'js/vendor/three.min.js'];
  for (const f of need) {
    if (!fs.existsSync(path.join(webdist, f))) throw new Error('暂存缺文件: ' + f);
  }
  console.log('[1/4] 网页资源已暂存 →', path.relative(root, webdist));
}

/* ---- 2. 图标（缺省时生成） ---- */
function ensureIcons() {
  const ico = path.join(srcTauri, 'icons', 'icon.ico');
  if (!fs.existsSync(ico)) {
    execFileSync(process.execPath, [path.join(__dirname, 'make-icon.js')], { stdio: 'inherit' });
  }
  if (!fs.existsSync(ico)) throw new Error('图标生成失败');
  console.log('[2/4] 图标就绪 →', path.relative(root, ico));
}

/* ---- 3. 编译 ---- */
function build(checkOnly) {
  const args = checkOnly ? ['check'] : ['build', '--release'];
  console.log(`[3/4] cargo ${args.join(' ')}（首次编译数百个 crate，需要几分钟）…`);
  execFileSync('cargo', args, { cwd: srcTauri, stdio: 'inherit' });
  console.log('[3/4] 编译完成');
}

/* ---- 4. 组装 dist\3D魔方\ ---- */
const README = `3D 魔方（桌面版）  v1.0.0
================================

■ 怎么用
双击本文件夹里的「3D魔方.exe」即可打开，无需安装、无需联网。
（首次运行若出现 Windows SmartScreen 提示，点「更多信息 → 仍要运行」。）

■ 数据存在哪
本文件夹下的 data\\ 目录：魔方进度、速拧成绩、设置都存在这里。
整个文件夹可以拷到 U 盘或别的电脑，数据跟着走。

■ 与网页版互导数据
浏览器里网页版的成绩不会自动出现在这里，可以互导：
  网页版 设置 → 导出 → 得到 JSON 文件
  本应用 设置 → 导入 → 选择该文件
反向同理。

■ 运行要求
Windows 10/11；系统需带 WebView2 运行时（Win10/11 自带 Edge 即有，本机已装）。

■ 功能
2×2~5×5 魔方：拖动转层、拖空白处/按钮旋转视角、打乱、复原、计时、庆祝动画；
速拧计时器（空格键，按住预热松手开表）；成绩统计（最佳/平均/ao5/ao12/趋势图）；
设置（音效、手感、数据导出/导入/清空）。

■ 重新打包（开发者）
在项目根目录执行：node tools/build-exe.js
`;

function assemble() {
  const exe = path.join(srcTauri, 'target', 'release', 'rubik3d.exe');
  if (!fs.existsSync(exe)) throw new Error('未找到编译产物: ' + exe);
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(exe, path.join(distDir, '3D魔方.exe'));
  fs.writeFileSync(path.join(distDir, '使用说明.txt'), README.replace(/\n/g, '\r\n'), 'utf8');
  const size = (fs.statSync(path.join(distDir, '3D魔方.exe')).size / 1024 / 1024).toFixed(1);
  console.log(`[4/4] 产物就绪 → ${distDir}\\3D魔方.exe（${size} MB）`);
}

stage();
ensureIcons();
if (mode === '--stage') process.exit(0);
build(mode === '--check');
if (mode !== '--check') assemble();