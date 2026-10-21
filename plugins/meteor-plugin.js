/* ============================================================
 * 流星群 プラグイン  v1.2.0
 * VRM Easy Customizer（プラグイン）用
 *
 * アバターの後ろの背景に、流星群を降らせます。
 *   ・流星は画面に貼りついた「背景」として描かれ、アバターの後ろに隠れます。
 *     カメラを回しても背景のままで、撮影画像・動画にも写ります。
 *   ・流れ方は2種類：「向きをそろえて流す」（スライダーで指定した角度に、すべて同じ向き）／
 *     「円形に回転」（床の少し下を中心に、円を描いて回る。中心はカメラを回しても床に追従）。
 *   ・「流れる速さ」は最大の速さです。流星ごとに、それ以下の速さでばらつきます。
 *   ・流星の頭には、レンズフレアと同じ描き方のきらめき（ハロー＋45度の星型の光芒＋短い十字）が付き、
 *     一つひとつが別々のタイミングでまたたきます。
 *   ・流星の大きさ（尾の長さ・太さ・きらめき）は、一つひとつ大きくばらつきます。
 *   ・流星の色は、白・青白・金・色相指定、または流星ごとにランダムに変わるモードを選べます。
 *   ・設定は保存せず、起動のたびにオフ・初期値から始まります。
 * ============================================================ */
(function () {
  'use strict';
  if (!window.VRMPlugins || typeof window.VRMPlugins.register !== 'function') {
    throw new Error('プラグイン基盤（VRMPlugins）が見つかりません');
  }

  window.VRMPlugins.register({
    id: 'meteor-shower',
    name: '流星群',
    version: '1.2.0',
    description: '背景に流星群を降らせます。',

    mount: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene;
      var host = ctx.container;
      var COARSE = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      var MAX = COARSE ? 18 : 30;   // 流星の最大数（量スライダー100%のとき）

      /* ---------- 設定（保存・読み込みはしない） ---------- */
      var DEF = { on: false, amount: 30, speed: 70, len: 50, thick: 40, gain: 60, sparkle: 60,
                  pattern: 'linear', angle: 135, cdrop: 20, rev: false, color: 'white', hue: 200, frozen: false };
      var COLORS = {
        white:  { n: '白' },
        ice:    { n: '青白' },
        gold:   { n: '金' },
        custom: { n: '色相スライダーで指定' },
        random: { n: 'ランダム（流星ごとに色が変わる）' }
      };
      var PATTERNS = {
        linear: { n: '向きをそろえて流す' },
        circle: { n: '円形に回転（床の少し下が中心）' }
      };
      var S = {};
      Object.keys(DEF).forEach(function (k) { S[k] = DEF[k]; });

      function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
      function rnd() { return Math.random(); }
      function hslRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        function f(n) {
          var k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
          return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        }
        return [f(0), f(8), f(4)];
      }

      /* ---------- 流星の描画（画面に貼りつく背景） ---------- */
      // 位置は「画面の高さの半分 = 1」の単位で持ち、頂点シェーダーで
      // カメラ前方 uDepth の距離に置く。深度テストでアバターの後ろに隠れる。

      // (1) 尾（ストリーク）
      var VERT = [
        'attribute vec2 aPos;',
        'attribute vec2 aDir;',
        'attribute vec2 aSize;',
        'attribute vec3 aCol;',
        'attribute float aA;',
        'uniform float uScale;',
        'uniform float uDepth;',
        'varying vec2 vUv;',
        'varying vec3 vCol;',
        'varying float vA;',
        'void main(){',
        '  vec2 d = aDir;',
        '  vec2 pr = vec2(-d.y, d.x);',
        '  float Q = aSize.x;',
        '  vec2 center = aPos - d * Q * 0.4;',
        '  vec2 p = center + d * position.x * Q + pr * position.y * aSize.y;',
        '  vUv = vec2(position.x + 0.5, position.y * 2.0);',
        '  vCol = aCol;',
        '  vA = aA;',
        '  gl_Position = projectionMatrix * vec4(p * uScale, -uDepth, 1.0);',
        '}'
      ].join('\n');
      var FRAG = [
        'varying vec2 vUv;',
        'varying vec3 vCol;',
        'varying float vA;',
        'uniform float uGain;',
        'void main(){',
        '  float u = vUv.x;',
        '  float v = vUv.y;',
        '  float t = clamp(u / 0.9, 0.0, 1.0);',
        '  float beyond = max(u - 0.9, 0.0) / 0.1;',
        '  float body = exp(-v * v * 6.0) * pow(t, 2.4) * (1.0 - smoothstep(0.0, 1.0, beyond));',
        '  float dh = (u - 0.9) / 0.1;',
        '  float glow = exp(-(dh * dh) * 1.5 - v * v * 2.0) * 0.9;',
        '  float a = max(body, glow);',
        '  float head = smoothstep(0.7, 0.9, u);',
        '  vec3 col = mix(vCol, vec3(1.0), head * 0.4);',
        // 明るさを上げても白に飛ばないよう、色相を保ったまま最大成分を1に収める
        '  col *= uGain;',
        '  float m = max(col.r, max(col.g, col.b));',
        '  if (m > 1.0) col /= m;',
        '  float alpha = a * vA;',
        '  if (alpha < 0.003) discard;',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n');

      // (2) 頭のきらめき（レンズフレア風：ハロー＋45度の星型の光芒＋短い十字。一つずつまたたく）
      var VERT2 = [
        'attribute vec2 aPos;',
        'attribute vec2 aSpark;',   // x = きらめきの半径, y = またたきの位相(0〜1)
        'attribute vec3 aCol;',
        'attribute float aA;',
        'uniform float uScale;',
        'uniform float uDepth;',
        'varying vec2 vUv;',
        'varying vec3 vCol;',
        'varying float vA;',
        'varying float vPh;',
        'void main(){',
        '  vUv = position.xy * 2.0;',
        '  vCol = aCol;',
        '  vA = aA;',
        '  vPh = aSpark.y;',
        '  vec2 p = aPos + position.xy * 2.0 * aSpark.x;',
        '  gl_Position = projectionMatrix * vec4(p * uScale, -uDepth, 1.0);',
        '}'
      ].join('\n');
      var FRAG2 = [
        'varying vec2 vUv;',
        'varying vec3 vCol;',
        'varying float vA;',
        'varying float vPh;',
        'uniform float uGain;',
        'uniform float uTime;',
        'uniform float uSpark;',
        'void main(){',
        '  vec2 q = vUv;',
        '  float r = length(q);',
        '  float fr = 2.5 + fract(vPh * 7.31) * 4.5;',                       // 流星ごとに違うまたたきの速さ
        '  float tw = 0.5 + 0.5 * sin(uTime * fr + vPh * 6.2831);',          // 斜めの光芒のまたたき
        '  float tw2 = 0.5 + 0.5 * sin(uTime * fr * 1.7 + vPh * 12.0);',     // 十字のまたたき
        '  float halo = exp(-r * r * 14.0) * (0.45 + 0.35 * tw);',
        '  float core = exp(-r * r * 150.0);',
        '  vec2 d = vec2(q.x + q.y, q.x - q.y) * 0.70710678;',
        '  float rl = mix(0.5, 1.0, tw);',                                    // 光芒の長さも呼吸させる
        '  float diag = exp(-abs(d.y) * 60.0) * exp(-abs(d.x) * 3.4 / rl)',
        '             + exp(-abs(d.x) * 60.0) * exp(-abs(d.y) * 3.4 / rl);',
        '  float crs = (exp(-abs(q.y) * 75.0) * exp(-abs(q.x) * 9.0)',
        '             + exp(-abs(q.x) * 75.0) * exp(-abs(q.y) * 9.0)) * 0.6 * (0.3 + 0.7 * tw2);',
        '  float rays = (diag * (0.25 + 0.75 * tw) + crs) * uSpark;',
        '  float edge = 1.0 - smoothstep(0.8, 1.0, max(abs(q.x), abs(q.y)));',
        '  float a = clamp((halo * uSpark + core + rays) * edge, 0.0, 1.0);',
        '  float alpha = a * vA;',
        '  if (alpha < 0.003) discard;',
        '  float w = clamp(core + rays * 0.7, 0.0, 1.0);',
        '  vec3 col = mix(vCol, vec3(1.0), w * 0.85);',
        '  col *= uGain;',
        '  float m = max(col.r, max(col.g, col.b));',
        '  if (m > 1.0) col /= m;',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n');

      var uniforms = { uScale: { value: 1 }, uDepth: { value: 30 }, uGain: { value: 1 } };
      var uniforms2 = { uScale: uniforms.uScale, uDepth: uniforms.uDepth, uGain: uniforms.uGain,
                        uTime: { value: 0 }, uSpark: { value: DEF.sparkle / 100 } };
      function addBlend(opts) {
        opts.transparent = true; opts.depthTest = true; opts.depthWrite = false; opts.toneMapped = false;
        opts.side = THREE.DoubleSide;
        opts.blending = THREE.CustomBlending;
        opts.blendEquation = THREE.AddEquation;
        opts.blendSrc = THREE.SrcAlphaFactor; opts.blendDst = THREE.OneFactor;
        opts.blendEquationAlpha = THREE.AddEquation;
        opts.blendSrcAlpha = THREE.OneFactor; opts.blendDstAlpha = THREE.OneFactor;
        return opts;
      }
      var mat = new THREE.ShaderMaterial(addBlend({ uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG }));
      var mat2 = new THREE.ShaderMaterial(addBlend({ uniforms: uniforms2, vertexShader: VERT2, fragmentShader: FRAG2 }));

      var plane = new THREE.PlaneGeometry(1, 1);
      var geo = new THREE.InstancedBufferGeometry();
      geo.index = plane.index;
      geo.setAttribute('position', plane.getAttribute('position'));
      geo.setAttribute('uv', plane.getAttribute('uv'));
      var geo2 = new THREE.InstancedBufferGeometry();
      geo2.index = plane.index;
      geo2.setAttribute('position', plane.getAttribute('position'));
      geo2.setAttribute('uv', plane.getAttribute('uv'));

      var posA = new Float32Array(MAX * 2), dirA = new Float32Array(MAX * 2), sizeA = new Float32Array(MAX * 2),
          colA = new Float32Array(MAX * 3), alA = new Float32Array(MAX), sparkA = new Float32Array(MAX * 2);
      function inst(arr, n) { var a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; }
      var aPos = inst(posA, 2), aDir = inst(dirA, 2), aSize = inst(sizeA, 2), aCol = inst(colA, 3),
          aAl = inst(alA, 1), aSpark = inst(sparkA, 2);
      geo.setAttribute('aPos', aPos);
      geo.setAttribute('aDir', aDir);
      geo.setAttribute('aSize', aSize);
      geo.setAttribute('aCol', aCol);
      geo.setAttribute('aA', aAl);
      geo.instanceCount = MAX;
      geo2.setAttribute('aPos', aPos);
      geo2.setAttribute('aSpark', aSpark);
      geo2.setAttribute('aCol', aCol);
      geo2.setAttribute('aA', aAl);
      geo2.instanceCount = MAX;
      var mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'plugin-meteor-shower';
      mesh.frustumCulled = false;
      mesh.renderOrder = -10;   // 背景として、他の半透明より先に描く
      var mesh2 = new THREE.Mesh(geo2, mat2);
      mesh2.name = 'plugin-meteor-shower-sparkle';
      mesh2.frustumCulled = false;
      mesh2.renderOrder = -9;   // 尾の上にきらめきを重ねる
      scene.add(mesh);
      scene.add(mesh2);

      /* ---------- 流星のシミュレーション ---------- */
      var sx = new Float32Array(MAX), sy = new Float32Array(MAX),      // 出現位置（頭）
          vx = new Float32Array(MAX), vy = new Float32Array(MAX),      // 速度
          age = new Float32Array(MAX), life = new Float32Array(MAX),
          bri = new Float32Array(MAX), hueR = new Float32Array(MAX),
          th0 = new Float32Array(MAX), rad = new Float32Array(MAX), om = new Float32Array(MAX),   // 円形回転用（開始角・半径・角速度）
          act = new Uint8Array(MAX);                                    // 量スライダーで有効になっているか
      var curAsp = 1.5, simT = 0;
      // 円形回転の中心：床（y=0）の少し下の点を画面に投影した位置（画面の高さの半分 = 1 の単位）
      var ccx = 0, ccy = -0.5, cv = new THREE.Vector3();
      function updateCenter() {
        var cam = ctx.camera; if (!cam) return;
        cv.set(0, -S.cdrop / 100, 0);
        cv.project(cam);
        if (isFinite(cv.x) && isFinite(cv.y) && cv.z > -1 && cv.z < 1) { ccx = cv.x * curAsp; ccy = cv.y; }
      }
      function resetMeteors() { for (var i = 0; i < MAX; i++) act[i] = 0; }   // 流れ方を変えたら出し直す

      function activeCount() { return Math.round(MAX * clamp(S.amount, 0, 100) / 100); }
      // 同じ流星が再び現れるまでの間隔（量が少ないほど長い）
      function maxDelay() { return 0.3 + 2.0 * (1 - S.amount / 100); }
      // 速さスライダーは「最大の速さ」。100%でも旧版の最低速度（0.5）までに抑える
      function speedMax() { return 0.5 * (0.1 + 0.9 * S.speed / 100); }

      function meteorColor(i, out) {
        var c;
        if (S.color === 'ice') c = [0.25, 0.55, 1.0];        // 青白：白に寄せず、青が見えるようにする
        else if (S.color === 'gold') c = [1.0, 0.85, 0.55];
        else if (S.color === 'custom') c = hslRgb(S.hue, 0.9, 0.65);
        else if (S.color === 'random') c = hslRgb(hueR[i], 0.9, 0.65);
        else c = [1, 1, 1];
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      }
      var tmpC = [0, 0, 0];
      function recolorAll() {
        for (var i = 0; i < MAX; i++) { meteorColor(i, tmpC); colA[i * 3] = tmpC[0]; colA[i * 3 + 1] = tmpC[1]; colA[i * 3 + 2] = tmpC[2]; }
        aCol.needsUpdate = true;
      }

      var SF_MIN = 0.35, SF_MAX = 2.2;   // 大きさの倍率の範囲（対数で一様 = 小さいものが多く、大きいものがまれに混ざる）
      function respawn(i, initial) {
        var asp = curAsp;
        // 画面内のどこかを、寿命の中ほどで通過するように始点を決める
        var tx = (rnd() * 2 - 1) * asp * 1.05, ty = (rnd() * 2 - 1) * 1.05;
        var speed = speedMax() * (0.3 + 0.7 * rnd());         // 最大の速さ以下でばらつく
        var path = 0.9 + rnd() * 1.0;
        var dx, dy;
        if (S.pattern === 'circle') {
          // 画面内の点を、寿命の中ほどで通る円弧。中心まわりの半径はその点までの距離
          var rx = tx - ccx, ry = ty - ccy;
          var r = clamp(Math.sqrt(rx * rx + ry * ry), 0.12, 8);
          var sg = S.rev ? -1 : 1;                              // +1=反時計回り
          var span = Math.min(path / r, Math.PI * 1.6);
          rad[i] = r; om[i] = sg * speed / r;
          th0[i] = Math.atan2(ry, rx) - sg * span * 0.5;
          life[i] = span * r / speed;
          dx = -sg * Math.sin(th0[i]); dy = sg * Math.cos(th0[i]);
          sx[i] = 0; sy[i] = 0; vx[i] = 0; vy[i] = 0;
        } else {
          var base = S.angle * Math.PI / 180;
          dx = Math.cos(base); dy = -Math.sin(base);          // 0°=右へ / 90°=下へ。全流星で同じ向き
          life[i] = path / speed;
          sx[i] = tx - dx * path * 0.5; sy[i] = ty - dy * path * 0.5;
          vx[i] = dx * speed; vy[i] = dy * speed;
        }
        var sf = Math.exp(Math.log(SF_MIN) + rnd() * Math.log(SF_MAX / SF_MIN));
        bri[i] = clamp(0.45 + 0.3 * rnd() + 0.25 * Math.min(1, sf / 1.5), 0.45, 1);
        hueR[i] = rnd() * 360;
        var L = (0.12 + S.len / 100 * 0.8) * Math.pow(sf, 0.7) * (0.85 + 0.3 * rnd());
        var W = (0.004 + S.thick / 100 * 0.016) * Math.pow(sf, 0.8) * (0.85 + 0.3 * rnd());
        sizeA[i * 2] = L / 0.9; sizeA[i * 2 + 1] = W;
        dirA[i * 2] = dx; dirA[i * 2 + 1] = dy;
        sparkA[i * 2] = (0.03 + 0.04 * S.thick / 100) * sf;   // きらめきの半径
        sparkA[i * 2 + 1] = rnd();                             // またたきの位相
        meteorColor(i, tmpC);
        colA[i * 3] = tmpC[0]; colA[i * 3 + 1] = tmpC[1]; colA[i * 3 + 2] = tmpC[2];
        var md = maxDelay();
        age[i] = initial ? (rnd() * (life[i] + md) - md) : -rnd() * md;
      }

      function step(dt) {
        var n = activeCount();
        var circ = S.pattern === 'circle';
        if (circ) updateCenter();
        simT = (simT + dt) % 1000;
        uniforms2.uTime.value = simT;
        for (var i = 0; i < MAX; i++) {
          if (i >= n) { act[i] = 0; alA[i] = 0; continue; }
          if (!act[i]) { respawn(i, true); act[i] = 1; }
          age[i] += dt;
          if (age[i] >= life[i]) respawn(i, false);
          if (age[i] < 0) { alA[i] = 0; continue; }
          var t = age[i] / life[i];
          if (circ) {
            var th = th0[i] + om[i] * age[i], cs = Math.cos(th), sn = Math.sin(th), sg2 = om[i] < 0 ? -1 : 1;
            posA[i * 2] = ccx + rad[i] * cs;
            posA[i * 2 + 1] = ccy + rad[i] * sn;
            dirA[i * 2] = -sg2 * sn; dirA[i * 2 + 1] = sg2 * cs;      // 円の接線方向
          } else {
            posA[i * 2] = sx[i] + vx[i] * age[i];
            posA[i * 2 + 1] = sy[i] + vy[i] * age[i];
          }
          alA[i] = bri[i] * Math.min(t / 0.1, 1) * Math.min((1 - t) / 0.4, 1);
        }
        aPos.needsUpdate = true; aDir.needsUpdate = true; aSize.needsUpdate = true; aCol.needsUpdate = true;
        aAl.needsUpdate = true; aSpark.needsUpdate = true;
      }

      /* ---------- 毎フレーム ---------- */
      var alive = true, raf = 0, lastT = 0;
      function loop(now) {
        if (!alive) return;
        raf = requestAnimationFrame(loop);
        var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
        lastT = now;
        if (!S.on) { mesh.visible = false; mesh2.visible = false; return; }
        mesh.visible = true;
        mesh2.visible = S.sparkle > 0;
        var cam = ctx.camera;
        if (cam) {
          curAsp = cam.aspect || curAsp;
          var far = cam.far || 50;
          var D = clamp(far * 0.8, 3, 100);
          uniforms.uDepth.value = D;
          if (cam.isOrthographicCamera) uniforms.uScale.value = (cam.top - cam.bottom) / 2;
          else uniforms.uScale.value = Math.tan((cam.fov || 30) * Math.PI / 360) * D;
        }
        uniforms.uGain.value = 0.4 + S.gain / 100 * 1.6;
        uniforms2.uSpark.value = S.sparkle / 100;
        if (!S.frozen) step(dt);
      }
      raf = requestAnimationFrame(loop);

      /* ---------- 操作パネル ---------- */
      var root = document.createElement('div');
      var controls = {};
      function el(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text != null) e.textContent = text;
        return e;
      }
      var resetting = false;

      function addSlider(label, key, min, max, unitStr) {
        unitStr = unitStr || '%';
        var row = el('div'); row.className = 'slider-row';
        var lab = el('div'); lab.className = 'slider-label';
        var val = el('span', null, S[key] + unitStr);
        lab.appendChild(el('span', null, label)); lab.appendChild(val);
        var inp = document.createElement('input');
        inp.type = 'range'; inp.min = min; inp.max = max; inp.step = 1; inp.value = S[key];
        inp.addEventListener('input', function () {
          S[key] = Number(inp.value); val.textContent = inp.value + unitStr;
          if (key === 'hue') {
            if (!resetting && S.color !== 'custom' && controls.color) {   // 色相を動かしたら「色相指定」に切り替える
              S.color = 'custom';
              controls.color.inp.value = 'custom'; controls.color.val.textContent = COLORS.custom.n;
            }
            recolorAll();
          }
        });
        row.appendChild(lab); row.appendChild(inp); root.appendChild(row);
        controls[key] = { inp: inp, val: val, type: 'range', unit: unitStr, row: row };
      }

      function addSelect(label, key, opts) {
        var row = el('div'); row.className = 'slider-row';
        var lab = el('div'); lab.className = 'slider-label';
        var val = el('span', null, opts[S[key]].n);
        lab.appendChild(el('span', null, label)); lab.appendChild(val);
        var sel = el('select', 'width:100%;padding:6px;background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);');
        Object.keys(opts).forEach(function (k) {
          var o = document.createElement('option');
          o.value = k; o.textContent = opts[k].n;
          sel.appendChild(o);
        });
        sel.value = S[key];
        sel.addEventListener('change', function () {
          S[key] = sel.value; val.textContent = sel.options[sel.selectedIndex].text;
          if (key === 'color') recolorAll();
          if (key === 'pattern') { resetMeteors(); updateVis(); }
        });
        row.appendChild(lab); row.appendChild(sel); root.appendChild(row);
        controls[key] = { inp: sel, val: val, type: 'select', row: row };
      }

      function addCheck(label, key) {
        var row = el('label', 'display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink);margin-bottom:10px;cursor:pointer;');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !!S[key];
        cb.addEventListener('change', function () { S[key] = cb.checked; });
        row.appendChild(cb); row.appendChild(el('span', null, label));
        root.appendChild(row);
        controls[key] = { inp: cb, type: 'check', row: row };
      }

      addCheck('流星群を降らせる', 'on');
      addSlider('流星の量', 'amount', 0, 100);
      addSlider('流れる速さ（最大）', 'speed', 0, 100);
      addSlider('尾の長さ', 'len', 0, 100);
      addSlider('太さ', 'thick', 0, 100);
      addSlider('明るさ', 'gain', 0, 100);
      addSlider('きらめき（星型の光芒）', 'sparkle', 0, 100);
      addSelect('流れ方', 'pattern', PATTERNS);
      addSlider('流れる向き（0°=右へ／90°=下へ）', 'angle', 0, 360, '°');
      addSlider('回転の中心（床から下へ）', 'cdrop', 0, 100, 'cm');
      addCheck('回転の向きを逆にする（初期=反時計回り）', 'rev');
      addSelect('流星の色', 'color', COLORS);
      addSlider('色味（色相）', 'hue', 0, 360, '°');
      addCheck('流星を止める（撮影用）', 'frozen');

      function updateVis() {
        var circ = S.pattern === 'circle';
        controls.angle.row.style.display = circ ? 'none' : '';
        controls.cdrop.row.style.display = circ ? '' : 'none';
        controls.rev.row.style.display = circ ? '' : 'none';
      }
      updateVis();

      var resetBtn = el('button', 'margin-top:4px;', '流星群の設定をリセット');
      resetBtn.type = 'button'; resetBtn.className = 'chip';
      resetBtn.addEventListener('click', function () {
        resetting = true;
        Object.keys(DEF).forEach(function (k) {
          S[k] = DEF[k];
          var c = controls[k]; if (!c) return;
          if (c.type === 'check') c.inp.checked = !!DEF[k];
          else if (c.type === 'select') { c.inp.value = DEF[k]; c.val.textContent = c.inp.options[c.inp.selectedIndex].text; }
          else { c.inp.value = DEF[k]; c.val.textContent = DEF[k] + c.unit; }
        });
        resetting = false;
        recolorAll();
        resetMeteors();
        updateVis();
      });
      root.appendChild(resetBtn);
      root.appendChild(el('div', 'font-size:10.5px;color:var(--ink-faint);line-height:1.6;margin-top:8px;',
        '流星はアバターの後ろの背景に描かれ、カメラを回しても画面に対して同じ位置に降ります。' +
        '「向きをそろえて流す」ではすべての流星が同じ向きに、「円形に回転」では床の少し下を中心に円を描いて流れます（中心はカメラを回しても床に追従します）。' +
        '「流れる速さ」は最大の速さで、流星ごとにそれ以下の速さでばらつきます。' +
        '大きさ・尾の長さ・きらめきは、流星ごとに大きくばらつきます。' +
        '尾の長さ・太さは、次に現れる流星から反映されます。'));
      host.appendChild(root);

      /* ---------- 後片付け ---------- */
      return {
        unmount: function () {
          alive = false;
          cancelAnimationFrame(raf);
          try { scene.remove(mesh); scene.remove(mesh2); } catch (e) { /* noop */ }
          try { geo.dispose(); geo2.dispose(); plane.dispose(); mat.dispose(); mat2.dispose(); } catch (e) { /* noop */ }
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
  });
})();
