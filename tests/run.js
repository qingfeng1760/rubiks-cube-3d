/* 极简测试运行器：node tests/run.js [测试文件名...] */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = __dirname;
let files = process.argv.slice(2);
if (files.length === 0) {
  files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
}
if (files.length === 0) { console.log('没有找到测试文件'); process.exit(1); }

let passed = 0, failed = 0;
const failures = [];

for (const f of files) {
  const file = path.isAbsolute(f) ? f : path.join(dir, f);
  console.log(`\n=== ${path.basename(file)} ===`);
  const register = (name, fn) => {
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      failures.push({ file: path.basename(file), name, err: e });
      console.log(`  ✗ ${name}\n      ${e.message}`);
    }
  };
  register.pending = (name) => { console.log(`  - 跳过 ${name}`); };
  require(file)(register);
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) { failures.forEach(x => console.error(`失败: [${x.file}] ${x.name}: ${x.err.stack}`)); process.exit(1); }
