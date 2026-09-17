/* 3D 魔方渲染与交互（依赖全局 THREE 与 CubeCore）。
 * 思路：27 个 cubie 网格放在一个 group 里；转层时把该层 cubie 挂到 pivot
 * 做补间旋转，结束后复位所有 cubie 变换，并按最新 facelets 重建贴纸颜色
 * （cubie 都是同款方块，视觉上等价于真实排列交换）。 */
(function (root) {
  'use strict';

  var COLORS = { U: 0xf5f6fa, R: 0xe8443a, F: 0x2ecc71, D: 0xf7d716, L: 0xf28c1c, B: 0x2f7ef7 };
  var INNER = 0x14162b;

  // 面贴索引查找表：'x,y,z|nx,ny,nz' -> facelet index
  var IDX = {};
  CubeCore.DEFS.forEach(function (d, i) {
    IDX[d.pos.join(',') + '|' + d.normal.join(',')] = i;
  });
  // 面法向量 -> 材质槽位（BoxGeometry 材质顺序 +x,-x,+y,-y,+z,-z）
  var SLOT = { '1,0,0': 0, '-1,0,0': 1, '0,1,0': 2, '0,-1,0': 3, '0,0,1': 4, '0,0,-1': 5 };
  var FACE_OF_SLOT = ['R', 'L', 'U', 'D', 'F', 'B'];
  var AXIS_VEC = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  function Cube3D(canvas, opts) {
    if (typeof THREE === 'undefined') throw new Error('THREE 未加载');
    opts = opts || {};
    var self = this;
    this.canvas = canvas;
    this.facelets = CubeCore.SOLVED;
    this.onUserMove = opts.onUserMove || function () {};   // 用户拖出一步后回调(moveStr)
    this.onTurnDone = opts.onTurnDone || function () {};   // 每次转层动画完成回调
    this.animSpeed = opts.animSpeed || 1;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(4.4, 4.6, 5.6);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var dl = new THREE.DirectionalLight(0xffffff, 0.75);
    dl.position.set(5, 8, 6);
    this.scene.add(dl);
    var dl2 = new THREE.DirectionalLight(0x8899ff, 0.25);
    dl2.position.set(-6, -4, -5);
    this.scene.add(dl2);

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);
    // pivot 必须是 cubeGroup 的子节点：转层绕魔方本地轴旋转，
    // 与视角旋转（cubeGroup 自身旋转）互不干扰
    this.pivot = new THREE.Group();
    this.cubeGroup.add(this.pivot);

    // 27 个 cubie（含内部不可见块，简化处理）
    var geo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    this.cubies = [];
    for (var x = -1; x <= 1; x++) for (var y = -1; y <= 1; y++) for (var z = -1; z <= 1; z++) {
      var mats = [];
      for (var s = 0; s < 6; s++) mats.push(new THREE.MeshLambertMaterial({ color: INNER }));
      var mesh = new THREE.Mesh(geo, mats);
      mesh.userData.grid = [x, y, z];
      mesh.position.set(x, y, z);
      this.cubies.push(mesh);
      this.cubeGroup.add(mesh);
    }
    this._rebuildMaterials();

    this.turnQueue = [];
    this.turning = null;
    this.mode = 'idle'; // idle | orbit | pending | turning
    this._bindPointer();
    this._resize();
    window.addEventListener('resize', function () { self._resize(); });

    var last = performance.now();
    this._lastTickAt = last;
    var loop = function (now) {
      requestAnimationFrame(loop);
      var dt = now - last;
      last = now;
      self._tick(Math.min(dt, 100)); // 后台标签页帧率低时限制单步步长
      renderer.render(self.scene, self.camera);
    };
    loop(last);
    // 兜底：页面在后台时 rAF 停摆，用 interval 保证转层动画能完成（状态不卡死）
    setInterval(function () {
      var now = performance.now();
      if (now - self._lastTickAt > 150) self._tick(80);
    }, 80);
  }

  Cube3D.prototype._resize = function () {
    var w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Cube3D.prototype.setFacelets = function (f) {
    this.facelets = f;
    this._rebuildMaterials();
  };

  Cube3D.prototype._rebuildMaterials = function () {
    var f = this.facelets;
    this.cubies.forEach(function (c) {
      var g = c.userData.grid;
      for (var s = 0; s < 6; s++) {
        var n = FACE_OF_SLOT[s];
        // 面法向量方向修正：L/D/B 的外法向是负轴
        var sign = (n === 'R' || n === 'U' || n === 'F') ? 1 : -1;
        var axisIdx = n === 'x' || n === 'R' || n === 'L' ? 0 : (n === 'y' || n === 'U' || n === 'D' ? 1 : 2);
        var normal = [0, 0, 0]; normal[axisIdx] = sign;
        var p = [g[0], g[1], g[2]];
        // 只有位于该面表层的 cubie 才有贴纸
        if (p[axisIdx] !== sign) { c.material[s].color.setHex(INNER); continue; }
        var idx = IDX[p.join(',') + '|' + normal.join(',')];
        if (idx === undefined) { c.material[s].color.setHex(INNER); continue; }
        c.material[s].color.setHex(COLORS[f[idx]] || INNER);
      }
    });
  };

  /* ---- 转层队列 ---- */
  // moveStr 如 "R'"；opts.silent 时不回调 onUserMove
  Cube3D.prototype.enqueueMove = function (moveStr, opts) {
    var info = CubeCore.moveInfo(moveStr);
    this.turnQueue.push({
      axis: info.axis, layer: info.layer,
      dir: info.turns === 3 ? -1 : 1,              // 3 个顺时针 = 1 个逆时针
      angle: info.turns === 2 ? Math.PI : Math.PI / 2,
      move: moveStr, silent: !!(opts && opts.silent),
      user: !!(opts && opts.user)
    });
  };

  Cube3D.prototype.isBusy = function () {
    return !!this.turning || this.turnQueue.length > 0;
  };

  Cube3D.prototype._startTurn = function (t) {
    var self = this;
    this.turning = t;
    t.progress = 0;
    t.duration = (t.angle > 2 ? 260 : 170) / this.animSpeed; // 180° 稍慢
    this.pivot.rotation.set(0, 0, 0);
    // 把该层 cubie 挂到 pivot（保持世界坐标）
    this.cubies.forEach(function (c) {
      var g = c.userData.grid;
      var coord = t.axis === 'x' ? g[0] : t.axis === 'y' ? g[1] : g[2];
      if (coord === t.layer) self.pivot.attach(c);
    });
  };

  Cube3D.prototype._endTurn = function () {
    var t = this.turning;
    var self = this;
    // 复位所有 cubie 到原始网格位与单位旋转
    this.cubies.forEach(function (c) {
      self.cubeGroup.attach(c);
      var g = c.userData.grid;
      c.position.set(g[0], g[1], g[2]);
      c.rotation.set(0, 0, 0);
    });
    this.pivot.rotation.set(0, 0, 0);
    this.turning = null;
    if (t.user) {
      this.onUserMove(t.move);   // 用户操作（拖拽/按钮）的动作：由应用写入逻辑状态
    } else {
      this.onTurnDone(t.move, t.silent); // 打乱等程序动画
    }
  };

  Cube3D.prototype._tick = function (dt) {
    dt = dt || 16.7;
    this._lastTickAt = performance.now();
    if (!this.turning && this.turnQueue.length) this._startTurn(this.turnQueue.shift());
    var t = this.turning;
    if (t) {
      t.progress += dt / t.duration;
      if (t.progress >= 1) {
        this.pivot.rotation[t.axis] = t.dir * t.angle;
        this._endTurn();
      } else {
        var e = 1 - Math.pow(1 - t.progress, 3); // easeOutCubic
        this.pivot.rotation[t.axis] = t.dir * t.angle * e;
      }
    }
  };

  /* ---- 指针交互：拖层 / 旋转视角 ---- */
  Cube3D.prototype._bindPointer = function () {
    var self = this;
    var canvas = this.canvas;
    var raycaster = new THREE.Raycaster();
    var down = null; // {x,y, grid, normal, point}

    function ndc(e) {
      var r = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (self.isBusy()) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件无真实指针，忽略 */ }
      var p = ndc(e);
      raycaster.setFromCamera(p, self.camera);
      var hits = raycaster.intersectObjects(self.cubies);
      if (hits.length) {
        var h = hits[0];
        var n = h.face.normal.clone(); // cubie 无旋转，局部法向 = 世界法向
        down = {
          x: e.clientX, y: e.clientY,
          grid: h.object.userData.grid.slice(),
          normal: n,
          point: h.point.clone()
        };
        self.mode = 'pending';
      } else {
        down = { x: e.clientX, y: e.clientY };
        self.mode = 'orbit';
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (self.mode === 'orbit') {
        self.cubeGroup.rotation.y += dx * 0.008;
        self.cubeGroup.rotation.x += dy * 0.008;
        down.x = e.clientX; down.y = e.clientY;
        return;
      }
      if (self.mode !== 'pending') return;
      var sens = (self.dragSensitivity || 1);
      if (Math.sqrt(dx * dx + dy * dy) < 12 / sens) return;
      // 把拖动方向投到贴纸所在平面（世界空间），求旋转轴
      var p = ndc(e);
      raycaster.setFromCamera(p, self.camera);
      // 贴纸法向是魔方本地坐标，换算到世界空间求平面
      var worldNormal = down.normal.clone().applyQuaternion(self.cubeGroup.quaternion);
      var plane = new THREE.Plane(worldNormal, -worldNormal.dot(down.point));
      var hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) { self.mode = 'idle'; down = null; return; }
      // 旋转轴在魔方本地坐标系中计算（与 pivot 的本地旋转一致），视角旋转不影响结果
      var deltaCube = hit.clone().sub(down.point)
        .applyQuaternion(self.cubeGroup.quaternion.clone().invert());
      if (deltaCube.length() < 0.05) return;
      var axisV = new THREE.Vector3().crossVectors(down.normal, deltaCube);
      // 取主导分量作为旋转轴
      var ax = 'x', best = Math.abs(axisV.x);
      if (Math.abs(axisV.y) > best) { ax = 'y'; best = Math.abs(axisV.y); }
      if (Math.abs(axisV.z) > best) { ax = 'z'; best = Math.abs(axisV.z); }
      if (best < 1e-4) return;
      var dir = axisV[ax] > 0 ? 1 : -1;
      var axisIdx = ax === 'x' ? 0 : ax === 'y' ? 1 : 2;
      var layer = down.grid[axisIdx];
      down = null;
      if (layer === 0) { self.mode = 'idle'; return; } // 中层拖动不做转层
      self.mode = 'turning';
      var move = Cube3D.dragToMove(ax, layer, dir);
      self.turnQueue.push({ axis: ax, layer: layer, dir: dir, angle: Math.PI / 2, move: move, silent: false, user: true });
    });

    function up() {
      if (self.mode === 'pending' || self.mode === 'orbit') self.mode = 'idle';
      down = null;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  };

  /* 拖动 → 动作名：dir 为绕 +axis 的旋转方向（+1 = 逆时针 90°） */
  Cube3D.dragToMove = function (axis, layer, dir) {
    var face;
    if (axis === 'y') face = layer > 0 ? 'U' : 'D';
    else if (axis === 'x') face = layer > 0 ? 'R' : 'L';
    else face = layer > 0 ? 'F' : 'B';
    var prime = (layer > 0) === (dir > 0); // +90 绕 +axis：正层=逆时针(')，负层=顺时针
    return prime ? face + "'" : face;
  };

  /* 应用设置 */
  Cube3D.prototype.setAnimSpeed = function (v) { this.animSpeed = v || 1; };
  Cube3D.prototype.setSensitivity = function (v) { this.dragSensitivity = v || 1; };

  root.Cube3D = Cube3D;
})(typeof self !== 'undefined' ? self : this);
