/* 3D 魔方渲染与交互（依赖全局 THREE 与 CubeCore），支持 2~5 阶。
 * 思路：N³ 个 cubie 网格放在 cubeGroup 里；转层时把该层 cubie 挂到
 * pivot（cubeGroup 的子节点）做补间旋转，结束后复位所有 cubie 变换，
 * 并按最新 facelets 重建贴纸颜色（cubie 同款，视觉等价于真实排列交换）。
 * 视角旋转作用于 cubeGroup 自身，与转层互不干扰。 */
(function (root) {
  'use strict';

  var COLORS = { U: 0xf5f6fa, R: 0xe8443a, F: 0x2ecc71, D: 0xf7d716, L: 0xf28c1c, B: 0x2f7ef7 };
  var INNER = 0x14162b;

  // 材质槽位（BoxGeometry 材质顺序 +x,-x,+y,-y,+z,-z）→ 面字母与外法向符号
  var FACE_OF_SLOT = ['R', 'L', 'U', 'D', 'F', 'B'];
  var AXIS_VEC = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  function Cube3D(canvas, opts) {
    if (typeof THREE === 'undefined') throw new Error('THREE 未加载');
    opts = opts || {};
    var self = this;
    this.canvas = canvas;
    this.N = Math.min(5, Math.max(2, opts.order || 3));
    this.facelets = CubeCore.solvedState(this.N);
    this.onUserMove = opts.onUserMove || function () {};   // 用户操作（拖拽/按钮）回调
    this.onTurnDone = opts.onTurnDone || function () {};   // 程序动画（打乱等）回调
    this.animSpeed = opts.animSpeed || 1;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

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

    this._buildCubies();

    this.turnQueue = [];
    this.turning = null;
    this.mode = 'idle'; // idle | orbit | pending | turning
    this._bindPointer();
    this._resize();
    window.addEventListener('resize', function () { self._resize(); });
    // 容器尺寸随视口/布局变化时（竖横屏切换）自适应
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(canvas);
    }

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

  /* 相机距离：随阶数增大、竖屏（aspect<1）拉远 */
  Cube3D.prototype._cameraDist = function () {
    var w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 480;
    var aspect = w / h;
    var nFactor = (this.N + 1.5) / 4.5;          // N=3 → 1
    var aspectFactor = Math.max(1, 1.15 / Math.min(aspect, 1.6));
    return 8.4 * nFactor * aspectFactor;
  };

  Cube3D.prototype._placeCamera = function () {
    var d = this._cameraDist();
    var dir = new THREE.Vector3(4.4, 4.6, 5.6).normalize();
    this.camera.position.copy(dir.multiplyScalar(d));
    this.camera.lookAt(0, 0, 0);
  };

  Cube3D.prototype._buildCubies = function () {
    var self = this;
    var N = this.N;
    this.idxMap = CubeCore.faceletIndexMap(N);
    if (this.geometry) this.geometry.dispose();
    this.geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
    // 释放旧 cubie
    (this.cubies || []).forEach(function (c) { self.cubeGroup.remove(c); });
    this.cubies = [];
    var coords = [];
    for (var i = 0; i < N; i++) coords.push(2 * i - (N - 1)); // 缩放整数坐标
    coords.forEach(function (x) {
      coords.forEach(function (y) {
        coords.forEach(function (z) {
          var mats = [];
          for (var s = 0; s < 6; s++) mats.push(new THREE.MeshLambertMaterial({ color: INNER }));
          var mesh = new THREE.Mesh(self.geometry, mats);
          mesh.userData.grid = [x, y, z];
          mesh.position.set(x / 2, y / 2, z / 2); // 世界步长 1
          self.cubies.push(mesh);
          self.cubeGroup.add(mesh);
        });
      });
    });
    this._rebuildMaterials();
    this._placeCamera();
  };

  /* 切换阶数：重建方块组，状态清为该阶还原态 */
  Cube3D.prototype.setOrder = function (N) {
    N = Math.min(5, Math.max(2, N | 0));
    if (N === this.N && this.cubies && this.cubies.length) return;
    this.N = N;
    this.facelets = CubeCore.solvedState(N);
    this.cubeGroup.rotation.set(0, 0, 0);
    this.turnQueue = [];
    this._buildCubies();
    this._resize();
  };

  Cube3D.prototype._resize = function () {
    var w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._placeCamera();
  };

  Cube3D.prototype.setFacelets = function (f) {
    if (f.length !== 6 * this.N * this.N) return; // 阶数不符的存档直接忽略
    this.facelets = f;
    this._rebuildMaterials();
  };

  Cube3D.prototype._rebuildMaterials = function () {
    var f = this.facelets, N = this.N, m = N - 1;
    var self = this;
    this.cubies.forEach(function (c) {
      var g = c.userData.grid;
      for (var s = 0; s < 6; s++) {
        var face = FACE_OF_SLOT[s];
        var sign = (face === 'R' || face === 'U' || face === 'F') ? 1 : -1;
        var axisIdx = face === 'R' || face === 'L' ? 0 : (face === 'U' || face === 'D' ? 1 : 2);
        if (g[axisIdx] !== sign * m) { c.material[s].color.setHex(INNER); continue; }
        var normal = [0, 0, 0]; normal[axisIdx] = sign;
        var idx = self.idxMap[g.join(',') + '|' + normal.join(',')];
        if (idx === undefined) { c.material[s].color.setHex(INNER); continue; }
        c.material[s].color.setHex(COLORS[f[idx]] || INNER);
      }
    });
  };

  /* ---- 转层队列 ---- */
  // moveStr 如 "R'"、"2R"；opts.silent 时不回调 onTurnDone，opts.user 走 onUserMove
  Cube3D.prototype.enqueueMove = function (moveStr, opts) {
    var info = CubeCore.moveInfo(moveStr, this.N);
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
      c.position.set(g[0] / 2, g[1] / 2, g[2] / 2);
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
        var n = h.face.normal.clone(); // cubie 无自转，本地法向即魔方本地法向
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
      self.mode = 'turning';
      var move = CubeCore.dragToMove(ax, layer, dir, self.N);
      self.turnQueue.push({ axis: ax, layer: layer, dir: dir, angle: Math.PI / 2, move: move, silent: false, user: true });
    });

    function up() {
      if (self.mode === 'pending' || self.mode === 'orbit') self.mode = 'idle';
      down = null;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  };

  /* 应用设置 */
  Cube3D.prototype.setAnimSpeed = function (v) { this.animSpeed = v || 1; };
  Cube3D.prototype.setSensitivity = function (v) { this.dragSensitivity = v || 1; };

  root.Cube3D = Cube3D;
})(typeof self !== 'undefined' ? self : this);
