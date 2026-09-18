/* 视角轨道旋转（屏幕空间四元数）纯函数测试，不依赖 THREE / DOM。
 * 重点回归：修复前用欧拉角累加，魔方转过任意角度后拖动方向与屏幕脱节
 * （按住魔方下方水平拖动会在上下转）。修复后水平拖动只产生屏幕水平方向的
 * 移动、垂直拖动只产生屏幕垂直方向的移动，与魔方当前姿态无关。 */
'use strict';
const assert = require('assert');
const Cube3D = require('../js/cube3d.js');

/* ---- 独立实现的向量/四元数工具（不与被测代码共用，避免循环验证） ---- */
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(v, k) { return [v[0] * k, v[1] * k, v[2] * k]; }
function normalize(v) { return scale(v, 1 / Math.sqrt(dot(v, v))); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps === undefined ? 1e-12 : eps); }
function nearVec(a, b, eps) {
  return near(a[0], b[0], eps) && near(a[1], b[1], eps) && near(a[2], b[2], eps);
}
/* 四元数 [x,y,z,w] 旋转向量：v' = v + 2w(q×v) + 2q×(q×v) */
function rot(q, v) {
  const uv = cross([q[0], q[1], q[2]], v);
  const uuv = cross([q[0], q[1], q[2]], uv);
  return [
    v[0] + 2 * (q[3] * uv[0] + uuv[0]),
    v[1] + 2 * (q[3] * uv[1] + uuv[1]),
    v[2] + 2 * (q[3] * uv[2] + uuv[2])
  ];
}
function conj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
function quatNear(a, b, eps) {
  return near(a[0], b[0], eps) && near(a[1], b[1], eps) &&
    near(a[2], b[2], eps) && near(a[3], b[3], eps);
}

/* ---- 相机基：与 cube3d.js _placeCamera 的相机位置一致（three.js lookAt 的 z/x/y 轴） ---- */
const camDir = normalize([4.4, 4.6, 5.6]);            // 相机 Z 轴（由原点指向相机）
const camRight = normalize(cross([0, 1, 0], camDir)); // 相机 X 轴（屏幕右）
const camUp = cross(camDir, camRight);                // 相机 Y 轴（屏幕上）

/* 物体上"正对相机"的点，拖动后的世界位置：
 * 世界方向 p0 = camDir → 局部坐标 l = q0⁻¹·p0 → 拖动后 p1 = q1·l */
function frontAfter(q0, dx, dy) {
  const l = rot(conj(q0), camDir);
  const q1 = Cube3D.orbitQuat(q0, dx, dy, camRight, camUp);
  return { q1: q1, p1: rot(q1, l) };
}

module.exports = (t) => {
  t('相机基向量正交归一（测试前提）', () => {
    assert.ok(near(dot(camRight, camUp), 0), 'right·up 应为 0');
    assert.ok(near(dot(camRight, camDir), 0), 'right·dir 应为 0');
    assert.ok(near(dot(camUp, camDir), 0), 'up·dir 应为 0');
    assert.ok(near(dot(camRight, camRight), 1) && near(dot(camUp, camUp), 1), '应为单位向量');
  });

  t('quatAxisAngle：绕 Z 轴 90° 把 +X 转到 +Y', () => {
    const v = rot(Cube3D.quatAxisAngle(0, 0, 1, Math.PI / 2), [1, 0, 0]);
    assert.ok(nearVec(v, [0, 1, 0]), '实际 ' + JSON.stringify(v));
  });

  t('quatMul：a*b 等价于先应用 b 再应用 a', () => {
    const a = Cube3D.quatAxisAngle(0, 1, 0, 0.7);
    const b = Cube3D.quatAxisAngle(1, 0, 0, -0.4);
    const v = [0.3, -0.5, 0.8];
    assert.ok(nearVec(rot(Cube3D.quatMul(a, b), v), rot(a, rot(b, v))));
  });

  t('单位元与归一化：连续拖动后仍是单位四元数', () => {
    assert.ok(quatNear(Cube3D.quatMul([0, 0, 0, 1], Cube3D.quatAxisAngle(0, 1, 0, 0.5)),
      Cube3D.quatAxisAngle(0, 1, 0, 0.5)));
    let q = [0, 0, 0, 1];
    for (let i = 0; i < 200; i++) q = Cube3D.orbitQuat(q, 0.13, -0.07, camRight, camUp);
    assert.ok(near(Math.hypot(q[0], q[1], q[2], q[3]), 1), '模长应恒为 1');
  });

  t('水平拖动（单位姿态）：面向相机的点纯水平右移', () => {
    const p1 = frontAfter([0, 0, 0, 1], 0.3, 0).p1;
    const d = sub(p1, camDir);
    assert.ok(near(dot(d, camUp), 0), '不应有上下分量，实际 ' + dot(d, camUp));
    assert.ok(dot(d, camRight) > 0, '应向右移动');
  });

  t('垂直拖动（单位姿态）：面向相机的点纯垂直下移', () => {
    const p1 = frontAfter([0, 0, 0, 1], 0, 0.3).p1;
    const d = sub(p1, camDir);
    assert.ok(near(dot(d, camRight), 0), '不应有左右分量，实际 ' + dot(d, camRight));
    assert.ok(dot(d, camUp) < 0, '应向下移动');
  });

  t('大角度精确：水平 90° 后正对相机的点转到屏幕正右，垂直 90° 转到屏幕正下', () => {
    const h = frontAfter([0, 0, 0, 1], Math.PI / 2, 0).p1;
    assert.ok(nearVec(h, camRight, 1e-12), '水平 90° 应到正右，实际 ' + JSON.stringify(h));
    const v = frontAfter([0, 0, 0, 1], 0, Math.PI / 2).p1;
    assert.ok(nearVec(v, scale(camUp, -1), 1e-12), '垂直 90° 应到正下，实际 ' + JSON.stringify(v));
  });

  t('回归（用户反例）：任意姿态下水平拖动仍是纯水平右移、垂直仍是纯垂直下移', () => {
    const poses = [
      [0, 0, 0, 1],                                                  // 初始
      Cube3D.quatAxisAngle(1, 0, 0, Math.PI),                        // 上下颠倒
      Cube3D.quatAxisAngle(0, 1, 0, Math.PI / 2),                    // 转过 90°
      Cube3D.quatMul(Cube3D.quatAxisAngle(1, 0, 0, 0.7),             // 复合大角度姿态
        Cube3D.quatAxisAngle(0, 1, 0, 2.1)),
      Cube3D.orbitQuat([0, 0, 0, 1], 1.05, 0.55, camRight, camUp)    // 拖动得到的姿态
    ];
    poses.forEach((q0, i) => {
      const h = frontAfter(q0, 0.35, 0).p1;
      const dh = sub(h, camDir);
      assert.ok(near(dot(dh, camUp), 0), `姿态#${i} 水平拖动出现了上下分量 ` + dot(dh, camUp));
      assert.ok(dot(dh, camRight) > 0, `姿态#${i} 水平拖动未向右`);

      const v = frontAfter(q0, 0, 0.35).p1;
      const dv = sub(v, camDir);
      assert.ok(near(dot(dv, camRight), 0), `姿态#${i} 垂直拖动出现了左右分量 ` + dot(dv, camRight));
      assert.ok(dot(dv, camUp) < 0, `姿态#${i} 垂直拖动未向下`);
    });
  });

  t('单轴拖动可逆：等量反向拖动回到原姿态', () => {
    const q0 = Cube3D.quatMul(Cube3D.quatAxisAngle(1, 0, 0, 0.6),
      Cube3D.quatAxisAngle(0, 1, 0, -0.9));
    const backH = Cube3D.orbitQuat(Cube3D.orbitQuat(q0, 0.4, 0, camRight, camUp), -0.4, 0, camRight, camUp);
    assert.ok(quatNear(backH, q0, 1e-12), '水平反向拖动应回原姿态');
    const backV = Cube3D.orbitQuat(Cube3D.orbitQuat(q0, 0, 0.4, camRight, camUp), 0, -0.4, camRight, camUp);
    assert.ok(quatNear(backV, q0, 1e-12), '垂直反向拖动应回原姿态');
  });

  t('拖动到任意姿态都保持单位四元数并可用于后续拖动', () => {
    let q = [0, 0, 0, 1];
    for (let i = 0; i < 40; i++) q = Cube3D.orbitQuat(q, 0.31, 0.17, camRight, camUp);
    assert.ok(near(Math.hypot(q[0], q[1], q[2], q[3]), 1), '长链拖动不应漂移');
    const p1 = frontAfter(q, 0.2, 0).p1;
    assert.ok(dot(sub(p1, camDir), camRight) > 0, '长链拖动后水平方向仍应向右');
  });
};