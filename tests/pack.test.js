/* 打包（Tauri 桌面版）静态验收：
 * - 工程结构 / 配置 / 启动代码 / 自检脚本 都在位且符合约定
 * - 网页版离线化：Three.js 必须走本地 vendor，不得再引用 CDN
 * - 产物存在时校验 dist\3D魔方\ 完整性；未构建则标记 pending（不阻塞测试套件）
 * 真机运行为主的验收由 `3D魔方.exe --smoke` 完成（退出码 0 + smoke.png 渲染帧）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const srcTauri = path.join(root, 'src-tauri');
const distDir = path.join(root, 'dist', '3D魔方');

const read = (p) => fs.readFileSync(p, 'utf8');

module.exports = (t) => {
  t('网页版离线化：Three.js 走本地 vendor，不再依赖 CDN', () => {
    const html = read(path.join(root, 'index.html'));
    assert.ok(html.indexOf('js/vendor/three.min.js') !== -1, 'index.html 应引用本地 three.min.js');
    assert.ok(!/src="https?:\/\//.test(html), 'index.html 不应再有外链脚本（离线运行要求）');
    assert.ok(/onerror/.test(html), 'Three.js 加载失败处理必须保留');

    const three = path.join(root, 'js', 'vendor', 'three.min.js');
    assert.ok(fs.existsSync(three), '缺少 js/vendor/three.min.js');
    const src = read(three);
    assert.ok(src.length > 400000, 'three.min.js 体积异常（可能下载不完整）');
    assert.ok(/REVISION/.test(src) && /Copyright 2010-2021 Three\.js Authors/.test(src), 'three.min.js 内容不合法');
  });

  t('Tauri 工程结构完整', () => {
    ['Cargo.toml', 'build.rs', 'tauri.conf.json', 'src/main.rs', 'src/smoke.js',
      'capabilities/default.json', 'icons/icon.ico', 'icons/icon.png'].forEach((f) =>
      assert.ok(fs.existsSync(path.join(srcTauri, f)), '缺少 src-tauri/' + f));
  });

  t('tauri.conf.json：内嵌资源、中文产品名、不生成安装包、开放 IPC', () => {
    const conf = JSON.parse(read(path.join(srcTauri, 'tauri.conf.json')));
    assert.strictEqual(conf.productName, '3D魔方');
    assert.strictEqual(conf.build.frontendDist, './webdist');
    assert.strictEqual(conf.app.withGlobalTauri, true, '自检脚本需要 __TAURI__ 全局');
    assert.strictEqual(conf.bundle.active, false, '不生成安装包（避免下载 NSIS/WiX）');
    assert.ok(Array.isArray(conf.bundle.icon) && conf.bundle.icon.length > 0, '需配置图标');
    assert.ok(typeof conf.identifier === 'string' && conf.identifier.length > 0, '缺少 identifier');
    assert.strictEqual(conf.app.security.csp, null, '本地资源无需 CSP 限制');
  });

  t('Cargo.toml：tauri v2 + tauri-build，包名与产物名一致', () => {
    const toml = read(path.join(srcTauri, 'Cargo.toml'));
    assert.ok(/name = "rubik3d"/.test(toml), '包名应为 rubik3d（打包脚本据此找产物）');
    assert.ok(/^tauri = \{ version = "2"/m.test(toml), '应依赖 tauri v2');
    assert.ok(/^tauri-build = \{ version = "2"/m.test(toml), '应有 tauri-build 构建依赖');
    const buildRs = read(path.join(srcTauri, 'build.rs'));
    assert.ok(/tauri_build::build\(\)/.test(buildRs), 'build.rs 应调用 tauri_build::build()');
  });

  t('main.rs：便携数据目录 + 无控制台 + 自检命令与注入', () => {
    const rs = read(path.join(srcTauri, 'src', 'main.rs'));
    assert.ok(/#!?\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]/.test(rs),
      '发布版不应弹控制台窗口');
    assert.ok(/data_directory\(/.test(rs), '应把 WebView2 数据目录指到 exe 旁（便携）');
    assert.ok(/WEBVIEW2_USER_DATA_FOLDER/.test(rs), '应同时设置 WebView2 数据目录环境变量');
    assert.ok(/current_exe\(\)/.test(rs), '数据目录应基于 exe 所在路径');
    assert.ok(/fn smoke_report/.test(rs) && /fn smoke_shot/.test(rs), '缺少自检用的两个命令');
    assert.ok(/process::exit\(if ok \{ 0 \} else \{ 1 \}\)/.test(rs), '自检结果应映射为退出码 0/1');
    assert.ok(/on_page_load/.test(rs) && /PageLoadEvent::Finished/.test(rs), '应在页面加载完成后注入自检');
    assert.ok(/include_str!\("smoke\.js"\)/.test(rs), '自检脚本应编译进 exe');
    assert.ok(/"--smoke"/.test(rs), '应支持 --smoke 参数');
  });

  t('smoke.js：覆盖引擎/转层/视角/计时器/localStorage/截图', () => {
    const js = read(path.join(srcTauri, 'src', 'smoke.js'));
    ['3D 引擎就绪', '转层动画完成', '打乱完成', '视角按钮生效', '复位视角',
      '防误触：轻点不开表', '长按空格开表', '计时中「新打乱」被禁用', '计时中「放弃」可用',
      '计时中强制点「新打乱」无效', '「放弃」立即停表', 'localStorage 读写往返',
      '渲染截图已生成', '无 JS 报错'].forEach((k) => {
        assert.ok(js.indexOf(k) !== -1, '自检缺少项: ' + k);
      });
    assert.ok(/smoke_report/.test(js) && /smoke_shot/.test(js), '自检应上报结果与截图');
  });

  t('打包脚本：暂存资源、图标、编译、组装产物', () => {
    const js = read(path.join(root, 'tools', 'build-exe.js'));
    ['index.html', "'css'", "'js'", 'js/vendor/three.min.js'].forEach((f) =>
      assert.ok(js.indexOf(f) !== -1, '暂存列表缺少 ' + f));
    assert.ok(/cargo/.test(js) && /--release/.test(js), '应调用 cargo build --release');
    assert.ok(/rubik3d\.exe/.test(js), '应复制 rubik3d.exe');
    assert.ok(/3D魔方\.exe/.test(js), '产物应命名为 3D魔方.exe');
    assert.ok(/使用说明\.txt/.test(js), '应生成使用说明.txt');
    assert.ok(fs.existsSync(path.join(root, 'tools', 'make-icon.js')), '缺少图标生成脚本');
  });

  /* ---- 以下检查依赖"已经构建过"，未构建时标记 pending ---- */
  const built = fs.existsSync(path.join(distDir, '3D魔方.exe'));
  const name = '产物 dist\\3D魔方\\3D魔方.exe 存在且结构完整';
  if (!built) {
    t.pending(name + '（未构建，跳过）');
  } else {
    t(name, () => {
      const exe = path.join(distDir, '3D魔方.exe');
      const size = fs.statSync(exe).size;
      assert.ok(size > 1024 * 1024, 'exe 体积异常（资源应已内嵌）: ' + size);
      assert.ok(size < 60 * 1024 * 1024, 'exe 体积异常偏大: ' + size);
      const readme = read(path.join(distDir, '使用说明.txt'));
      assert.ok(/data/.test(readme) && /导入/.test(readme), '使用说明应包含数据位置与互导方法');
    });
  }
};